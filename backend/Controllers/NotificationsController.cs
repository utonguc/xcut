using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _db;
    public NotificationsController(AppDbContext db) => _db = db;

    private Guid? GetCurrentUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    private Guid? GetCurrentSalonId()
    {
        var claim = User.FindFirstValue("salonId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    // GET /api/Notifications?limit=20
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int limit = 20)
    {
        var userId  = GetCurrentUserId();
        var salonId = GetCurrentSalonId();
        if (userId is null || salonId is null) return Unauthorized();

        await GenerateDailyAsync(salonId.Value, userId.Value);

        var items = await _db.Notifications
            .Where(n => n.UserId == userId.Value)
            .OrderByDescending(n => n.CreatedAtUtc)
            .Take(Math.Min(limit, 50))
            .Select(n => new
            {
                n.Id, n.Title, n.Message, n.Type, n.Link, n.IsRead,
                CreatedAt = n.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(items);
    }

    // PATCH /api/Notifications/{id}/read
    [HttpPatch("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var n = await _db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId.Value);
        if (n is null) return NotFound();

        n.IsRead = true;
        await _db.SaveChangesAsync();
        return Ok();
    }

    // PATCH /api/Notifications/read-all
    [HttpPatch("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        await _db.Notifications
            .Where(n => n.UserId == userId.Value && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));

        return Ok();
    }

    private async Task GenerateDailyAsync(Guid salonId, Guid userId)
    {
        var today    = DateTime.UtcNow.Date;
        var todayStr = today.ToString("yyyy-MM-dd");

        // Skip entire generation if today's summary was already created for this user
        var alreadyDone = await _db.Notifications.AnyAsync(n =>
            n.UserId == userId && n.DedupeKey == $"daily:appt_summary:{salonId}:{todayStr}");
        if (alreadyDone) return;

        // ── 1. Bugünün randevu özeti ────────────────────────────────────────────
        var apptCount = await _db.Appointments
            .CountAsync(a => a.SalonId == salonId &&
                             a.StartAtUtc.Date == today &&
                             a.Status == "Scheduled");

        await TryAddAsync(salonId, userId,
            key:     $"daily:appt_summary:{salonId}:{todayStr}",
            title:   "📋 Bugünün Randevuları",
            message: apptCount > 0
                ? $"Bugün {apptCount} randevunuz var."
                : "Bugün planlanmış randevunuz yok.",
            type:    "info",
            link:    "/takvim");

        // ── 2. Doğum günleri ────────────────────────────────────────────────────
        var birthdays = await _db.Customers
            .Where(c => c.SalonId == salonId &&
                        c.BirthDate.HasValue &&
                        c.BirthDate.Value.Month == today.Month &&
                        c.BirthDate.Value.Day   == today.Day)
            .Select(c => c.FirstName + " " + c.LastName)
            .ToListAsync();

        if (birthdays.Count > 0)
        {
            var names = string.Join(", ", birthdays.Take(3));
            if (birthdays.Count > 3) names += $" +{birthdays.Count - 3} kişi daha";
            await TryAddAsync(salonId, userId,
                key:     $"daily:birthday:{salonId}:{todayStr}",
                title:   "🎂 Bugün Doğum Günü",
                message: $"{names} bugün doğum günü kutluyor.",
                type:    "info",
                link:    "/customers");
        }

        // ── 3. Vadesi geçen görevler ─────────────────────────────────────────────
        var overdueTasks = await _db.Tasks
            .CountAsync(t => t.SalonId == salonId &&
                             t.Status != "Done" &&
                             t.DueAtUtc.HasValue &&
                             t.DueAtUtc.Value < today);

        if (overdueTasks > 0)
            await TryAddAsync(salonId, userId,
                key:     $"daily:overdue_tasks:{salonId}:{todayStr}",
                title:   "⚠️ Vadesi Geçen Görevler",
                message: $"{overdueTasks} görevinizin vadesi geçmiş.",
                type:    "warning",
                link:    "/tasks");

        // ── 4. Açık kasa oturumu (dünden kalan) ──────────────────────────────────
        var yesterday    = today.AddDays(-1);
        var openKasa = await _db.CashSessions
            .AnyAsync(s => s.SalonId == salonId &&
                           s.Status  == "Open" &&
                           s.OpenedAtUtc.Date <= yesterday);

        if (openKasa)
            await TryAddAsync(salonId, userId,
                key:     $"daily:unclosed_kasa:{salonId}:{todayStr}",
                title:   "🔓 Açık Kasa Oturumu",
                message: "Dünden açık kalan bir kasa oturumu var. Kapatmayı unutmayın.",
                type:    "warning",
                link:    "/kasa");

        // ── 5. Düşük stok ────────────────────────────────────────────────────────
        var lowStock = await _db.StockItems
            .Where(s => s.SalonId == salonId && s.Quantity <= s.MinQuantity)
            .Select(s => s.Name)
            .ToListAsync();

        if (lowStock.Count > 0)
        {
            var names = string.Join(", ", lowStock.Take(3));
            if (lowStock.Count > 3) names += $" +{lowStock.Count - 3} ürün daha";
            await TryAddAsync(salonId, userId,
                key:     $"daily:low_stock:{salonId}:{todayStr}",
                title:   "📦 Düşük Stok Uyarısı",
                message: $"{lowStock.Count} ürün minimum seviyenin altında: {names}",
                type:    "warning",
                link:    "/stock");
        }

        // ── 6. Geri kazanılacak müşteriler (haftalık) ────────────────────────────
        var weekKey   = $"{today.Year}-W{ISOWeek.GetWeekOfYear(today)}";
        var threshold = today.AddDays(-30);
        var winBackCount = await _db.Customers
            .Where(c => c.SalonId == salonId &&
                        !_db.Appointments.Any(a => a.CustomerId == c.Id && a.StartAtUtc >= threshold))
            .CountAsync();

        if (winBackCount > 0)
            await TryAddAsync(salonId, userId,
                key:     $"weekly:winback:{salonId}:{weekKey}",
                title:   "💌 Geri Kazanılacak Müşteriler",
                message: $"{winBackCount} müşteri 30 gündür gelmiyor. İletişime geçin.",
                type:    "info",
                link:    "/customers");

        // ── 7. Bekleyen online randevu istekleri ─────────────────────────────────
        var pendingReqs = await _db.AppointmentRequests
            .CountAsync(r => r.SalonId == salonId && r.Status == "Pending");

        if (pendingReqs > 0)
            await TryAddAsync(salonId, userId,
                key:     $"daily:pending_requests:{salonId}:{todayStr}",
                title:   "📅 Bekleyen Randevu İstekleri",
                message: $"{pendingReqs} adet onay bekleyen online randevu isteği var.",
                type:    "info",
                link:    "/appointments");
    }

    private async Task TryAddAsync(
        Guid salonId, Guid userId, string key,
        string title, string message, string type, string? link)
    {
        var exists = await _db.Notifications.AnyAsync(n => n.DedupeKey == key);
        if (exists) return;

        _db.Notifications.Add(new Notification
        {
            SalonId   = salonId,
            UserId    = userId,
            Title     = title,
            Message   = message,
            Type      = type,
            Link      = link,
            DedupeKey = key,
        });
        await _db.SaveChangesAsync();
    }
}

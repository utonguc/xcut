using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WaitlistController : ControllerBase
{
    private readonly AppDbContext     _db;
    private readonly IWhatsAppService _wa;
    private readonly IEmailService    _email;

    public WaitlistController(AppDbContext db, IWhatsAppService wa, IEmailService email)
    {
        _db    = db;
        _wa    = wa;
        _email = email;
    }

    private Guid? GetSalonId() =>
        Guid.TryParse(User.FindFirstValue("salonId"), out var id) ? id : null;

    // GET /api/Waitlist
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] string? waitingType)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var q = _db.WaitlistEntries
            .Where(w => w.SalonId == salonId.Value)
            .Include(w => w.Customer)
            .Include(w => w.Stylist)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))      q = q.Where(w => w.Status == status);
        if (!string.IsNullOrWhiteSpace(waitingType)) q = q.Where(w => w.WaitingType == waitingType);

        var items = await q
            .OrderBy(w => w.PreferredDate)
            .ThenBy(w => w.CreatedAtUtc)
            .Select(w => new {
                w.Id, w.Status, w.WaitingType, w.ServiceName,
                w.PreferredDate, w.PreferredTimeFrom, w.PreferredTimeTo,
                w.Notes, w.CreatedAtUtc, w.Source,
                w.OfferedStartAt, w.OfferedEndAt, w.OfferExpiresAt, w.DeclineNote,
                CustomerName  = w.Customer != null ? w.Customer.FirstName + " " + w.Customer.LastName : w.CustomerName,
                CustomerPhone = w.Customer != null ? w.Customer.Phone  : w.CustomerPhone,
                CustomerEmail = w.Customer != null ? w.Customer.Email  : w.CustomerEmail,
                w.CustomerId,
                StylistName = w.Stylist != null ? w.Stylist.FullName : null,
                w.StylistId,
            })
            .ToListAsync();

        return Ok(items);
    }

    // POST /api/Waitlist — panel (authenticated)
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWaitlistRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == req.CustomerId && c.SalonId == salonId.Value);
        if (customer is null) return BadRequest(new { message = "Müşteri bulunamadı." });

        var entry = new WaitlistEntry
        {
            SalonId           = salonId.Value,
            CustomerId        = req.CustomerId,
            CustomerName      = customer.FirstName + " " + customer.LastName,
            CustomerFirstName = customer.FirstName,
            CustomerLastName  = customer.LastName,
            CustomerPhone     = customer.Phone,
            CustomerEmail     = customer.Email,
            StylistId         = req.StylistId,
            ServiceName       = req.ServiceName?.Trim(),
            WaitingType       = req.WaitingType ?? "flexible",
            PreferredDate     = req.PreferredDate,
            PreferredTimeFrom = req.PreferredTimeFrom?.Trim(),
            PreferredTimeTo   = req.PreferredTimeTo?.Trim(),
            Notes             = req.Notes?.Trim() ?? "",
            Status            = "Waiting",
            Source            = "panel",
        };
        _db.WaitlistEntries.Add(entry);
        await _db.SaveChangesAsync();
        return Ok(new { entry.Id, message = "Bekleme listesine eklendi." });
    }

    // POST /api/Waitlist/public — anonymous customer self sign-up
    [HttpPost("public")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicCreate([FromBody] PublicWaitlistRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Slug))
            return BadRequest(new { message = "Salon bulunamadı." });

        var firstName = req.CustomerFirstName?.Trim() ?? req.CustomerName?.Split(' ', 2)[0] ?? "";
        var lastName  = req.CustomerLastName?.Trim()
                        ?? (req.CustomerName?.Contains(' ') == true ? req.CustomerName.Split(' ', 2)[1] : "");

        if (string.IsNullOrWhiteSpace(firstName))
            return BadRequest(new { message = "Ad zorunludur." });
        if (string.IsNullOrWhiteSpace(req.CustomerPhone))
            return BadRequest(new { message = "Telefon numarası zorunludur." });

        var website = await _db.SalonWebsites
            .FirstOrDefaultAsync(w => w.Slug == req.Slug && w.IsPublished && w.BookingEnabled);
        if (website is null)
            return BadRequest(new { message = "Online rezervasyon bu salon için kapalı." });

        // WaitingType: explicitly sent, or infer from time fields
        var waitingType = !string.IsNullOrWhiteSpace(req.WaitingType)
            ? req.WaitingType
            : (!string.IsNullOrWhiteSpace(req.PreferredTimeFrom) ? "fixed_slot" : "flexible");

        var entry = new WaitlistEntry
        {
            SalonId           = website.SalonId,
            CustomerId        = null,
            CustomerName      = $"{firstName} {lastName}".Trim(),
            CustomerFirstName = firstName,
            CustomerLastName  = string.IsNullOrWhiteSpace(lastName) ? null : lastName,
            CustomerPhone     = req.CustomerPhone.Trim(),
            CustomerEmail     = req.CustomerEmail?.Trim().ToLowerInvariant(),
            StylistId         = req.StylistId,
            ServiceName       = req.ServiceName?.Trim(),
            WaitingType       = waitingType,
            PreferredDate     = req.PreferredDate,
            PreferredTimeFrom = req.PreferredTimeFrom?.Trim(),
            PreferredTimeTo   = req.PreferredTimeTo?.Trim(),
            Notes             = req.Notes?.Trim() ?? "",
            Status            = "Waiting",
            Source            = "public",
        };
        _db.WaitlistEntries.Add(entry);
        await _db.SaveChangesAsync();

        // Notify salon managers
        var managerRoles = new[] { "SalonYonetici", "SuperAdmin", "Resepsiyon" };
        var managers = await _db.Users
            .Where(u => u.SalonId == website.SalonId && u.IsActive && u.Role != null && managerRoles.Contains(u.Role.Name))
            .Select(u => u.Id)
            .ToListAsync();

        var typeLabel   = waitingType == "fixed_slot" ? "Sabit Saatli" : "Esnek";
        var servicePart = entry.ServiceName != null ? $" ({entry.ServiceName})" : "";
        foreach (var mgr in managers)
        {
            _db.Notifications.Add(new Notification
            {
                SalonId   = website.SalonId,
                UserId    = mgr,
                Title     = "Yeni Bekleme Talebi",
                Message   = $"{entry.CustomerName}{servicePart} — {typeLabel} bekleme talebi geldi.",
                Type      = "info",
                Link      = "/bekleme",
                DedupeKey = $"waitlist:public:{entry.Id}:{mgr}",
            });
        }
        await _db.SaveChangesAsync();

        return Ok(new { entry.Id, message = "Bekleme listesine eklendiniz." });
    }

    // POST /api/Waitlist/{id}/offer — Profil A (esnek): saat teklifi emaili gönder
    [HttpPost("{id:guid}/offer")]
    public async Task<IActionResult> SendOffer(Guid id, [FromBody] SendOfferRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries
            .FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        var email = entry.CustomerEmail;
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { message = "Müşterinin e-posta adresi yok. Teklif gönderilemez." });

        if (!DateTime.TryParseExact($"{req.OfferedDate} {req.OfferedTime}", "yyyy-MM-dd HH:mm",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var offeredLocal))
            return BadRequest(new { message = "Geçersiz tarih/saat formatı. (yyyy-MM-dd HH:mm bekleniyor)" });

        var offeredStartUtc = DateTime.SpecifyKind(offeredLocal, DateTimeKind.Local).ToUniversalTime();
        var duration        = req.DurationMinutes > 0 ? req.DurationMinutes : 60;
        var offeredEndUtc   = offeredStartUtc.AddMinutes(duration);

        var token     = Guid.NewGuid();
        var expiresAt = DateTime.UtcNow.AddHours(24);

        entry.OfferedStartAt = offeredStartUtc;
        entry.OfferedEndAt   = offeredEndUtc;
        entry.OfferToken     = token;
        entry.OfferExpiresAt = expiresAt;
        entry.Status         = "OfferSent";
        await _db.SaveChangesAsync();

        var salonName  = await _db.Salons.Where(s => s.Id == salonId.Value).Select(s => s.Name).FirstOrDefaultAsync() ?? "";
        var firstName  = entry.CustomerFirstName ?? entry.CustomerName.Split(' ')[0];
        const string baseUrl = "https://xcut.xshield.com.tr";
        var acceptUrl  = $"{baseUrl}/api/Waitlist/respond?token={token}&action=accept";
        var declineUrl = $"{baseUrl}/api/Waitlist/respond?token={token}&action=decline";

        var tr         = new System.Globalization.CultureInfo("tr-TR");
        var dateStr    = offeredLocal.ToString("dd MMMM yyyy dddd", tr);
        var timeStr    = offeredLocal.ToString("HH:mm");
        var endStr     = offeredLocal.AddMinutes(duration).ToString("HH:mm");

        var html = $"""
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
              <div style="background:#6366f1;padding:24px;border-radius:12px 12px 0 0">
                <h2 style="color:#fff;margin:0;font-size:22px">{salonName} — Randevu Teklifi</h2>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
                <p style="font-size:16px">Merhaba <strong>{firstName}</strong>,</p>
                <p>Bekleme listeniz için uygun bir randevu aralığı açıldı!</p>
                <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0">
                  <p style="margin:0;font-size:16px">📅 <strong>{dateStr}</strong></p>
                  <p style="margin:8px 0 0;font-size:16px">⏰ <strong>{timeStr} – {endStr}</strong></p>
                  {(entry.ServiceName != null ? $"<p style='margin:8px 0 0;font-size:15px'>✂️ {entry.ServiceName}</p>" : "")}
                </div>
                <p style="font-size:15px">Bu randevuyu kabul etmek veya reddetmek için aşağıdaki butonlara tıklayın:</p>
                <div style="margin:24px 0">
                  <a href="{acceptUrl}" style="background:#22c55e;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">✅ Kabul Et</a>
                  <a href="{declineUrl}" style="background:#ef4444;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;margin-left:12px">❌ Reddet</a>
                </div>
                <p style="color:#6b7280;font-size:13px">Bu teklif 24 saat geçerlidir. Yanıt vermezseniz teklifiniz otomatik iptal edilir.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
                <p style="color:#9ca3af;font-size:12px;margin:0">xCut tarafından gönderildi — {salonName}</p>
              </div>
            </div>
            """;

        await _email.SendAsync(email, $"{salonName} — Randevu Teklifi", html);
        return Ok(new { message = "Teklif e-postası gönderildi." });
    }

    // POST /api/Waitlist/{id}/approve — Profil B (sabit saat): doğrudan onayla + randevu oluştur
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries.Include(w => w.Customer)
            .FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        if (entry.Status is not ("Waiting" or "Notified"))
            return BadRequest(new { message = "Bu kayıt zaten işleme alınmış." });
        if (!entry.StylistId.HasValue)
            return BadRequest(new { message = "Önce stilist atamalısınız." });
        if (entry.PreferredDate is null)
            return BadRequest(new { message = "Tercih edilen tarih eksik." });

        if (!entry.CustomerId.HasValue)
            await EnsureCustomerAsync(entry, active: true);

        var startAt = BuildDateTime(entry.PreferredDate, entry.PreferredTimeFrom);
        var endAt   = BuildDateTime(entry.PreferredDate, entry.PreferredTimeTo) ?? startAt?.AddMinutes(60);

        if (startAt is null || endAt is null)
            return BadRequest(new { message = "Saat bilgisi eksik. Randevu oluşturulamadı." });

        var startUtc = DateTime.SpecifyKind(startAt.Value, DateTimeKind.Local).ToUniversalTime();
        var endUtc   = DateTime.SpecifyKind(endAt.Value,   DateTimeKind.Local).ToUniversalTime();

        var appt = new Appointment
        {
            SalonId     = salonId.Value,
            CustomerId  = entry.CustomerId!.Value,
            StylistId   = entry.StylistId!.Value,
            ServiceName = entry.ServiceName ?? "",
            StartAtUtc  = startUtc,
            EndAtUtc    = endUtc,
            Notes       = entry.Notes,
            Status      = "Scheduled",
        };
        _db.Appointments.Add(appt);
        entry.Status = "Booked";
        await _db.SaveChangesAsync();

        // E-posta bildirimi: müşteriye randevu onayı gönder
        var emailAddr = (await _db.Customers.FindAsync(entry.CustomerId!.Value))?.Email ?? entry.CustomerEmail;
        if (!string.IsNullOrWhiteSpace(emailAddr))
        {
            var salonName = await _db.Salons.Where(s => s.Id == salonId.Value).Select(s => s.Name).FirstOrDefaultAsync() ?? "";
            var firstName = entry.CustomerFirstName ?? entry.CustomerName.Split(' ')[0];
            var tr        = new System.Globalization.CultureInfo("tr-TR");
            var dateStr   = startAt.Value.ToString("dd MMMM yyyy dddd", tr);
            var timeStr   = startAt.Value.ToString("HH:mm");
            var html = $"""
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                  <div style="background:#22c55e;padding:24px;border-radius:12px 12px 0 0">
                    <h2 style="color:#fff;margin:0;font-size:22px">✅ Randevunuz Onaylandı!</h2>
                  </div>
                  <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
                    <p>Merhaba <strong>{firstName}</strong>,</p>
                    <p>Bekleme listeniz onaylandı ve randevunuz oluşturuldu.</p>
                    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0">
                      <p style="margin:0;font-size:16px">📅 <strong>{dateStr}</strong></p>
                      <p style="margin:8px 0 0;font-size:16px">⏰ <strong>{timeStr}</strong></p>
                      {(entry.ServiceName != null ? $"<p style='margin:8px 0 0;font-size:15px'>✂️ {entry.ServiceName}</p>" : "")}
                    </div>
                    <p>Salonumuzda görüşmek üzere!</p>
                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
                    <p style="color:#9ca3af;font-size:12px;margin:0">{salonName} — xCut</p>
                  </div>
                </div>
                """;
            _ = _email.SendAsync(emailAddr, $"Randevunuz Onaylandı — {salonName}", html);
        }

        return Ok(new { status = entry.Status, appointmentId = appt.Id, message = "Onaylandı, randevu oluşturuldu." });
    }

    // POST /api/Waitlist/{id}/decline — Reddet (pasif müşteri kaydı + not)
    [HttpPost("{id:guid}/decline")]
    public async Task<IActionResult> Decline(Guid id, [FromBody] DeclineWaitlistRequest? req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries
            .FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        if (!entry.CustomerId.HasValue)
            await EnsureCustomerAsync(entry, active: false);

        if (entry.CustomerId.HasValue)
        {
            var c = await _db.Customers.FindAsync(entry.CustomerId.Value);
            if (c is not null)
            {
                var note = $"[{DateTime.UtcNow:dd.MM.yyyy}] Bekleme listesi reddedildi — doluluk nedeniyle işleme alınamadı.";
                c.Notes = string.IsNullOrWhiteSpace(c.Notes) ? note : c.Notes + "\n" + note;
            }
        }

        entry.Status      = "Declined";
        entry.DeclineNote = req?.Reason ?? "Doluluk nedeniyle işleme alınamadı.";
        await _db.SaveChangesAsync();

        return Ok(new { status = entry.Status, message = "Reddedildi." });
    }

    // GET /api/Waitlist/respond?token=xxx&action=accept|decline — email link handler (public)
    [HttpGet("respond")]
    [AllowAnonymous]
    public async Task<IActionResult> RespondToOffer([FromQuery] Guid token, [FromQuery] string action)
    {
        var entry = await _db.WaitlistEntries.Include(w => w.Customer)
            .FirstOrDefaultAsync(w => w.OfferToken == token);

        if (entry is null)
            return Redirect("/bekleme/yanit?result=notfound");

        if (entry.Status != "OfferSent")
            return Redirect("/bekleme/yanit?result=already");

        if (entry.OfferExpiresAt.HasValue && entry.OfferExpiresAt < DateTime.UtcNow)
        {
            entry.Status = "Expired";
            await _db.SaveChangesAsync();
            return Redirect("/bekleme/yanit?result=expired");
        }

        if (action == "accept")
        {
            if (!entry.CustomerId.HasValue)
                await EnsureCustomerAsync(entry, active: true);

            if (entry.StylistId.HasValue && entry.OfferedStartAt.HasValue)
            {
                _db.Appointments.Add(new Appointment
                {
                    SalonId     = entry.SalonId,
                    CustomerId  = entry.CustomerId!.Value,
                    StylistId   = entry.StylistId!.Value,
                    ServiceName = entry.ServiceName ?? "",
                    StartAtUtc  = entry.OfferedStartAt!.Value,
                    EndAtUtc    = entry.OfferedEndAt ?? entry.OfferedStartAt!.Value.AddMinutes(60),
                    Notes       = entry.Notes,
                    Status      = "Scheduled",
                });
            }

            entry.Status = "Booked";
            await _db.SaveChangesAsync();

            // Notify salon managers that customer accepted
            var managerRoles = new[] { "SalonYonetici", "SuperAdmin", "Resepsiyon" };
            var managers = await _db.Users
                .Where(u => u.SalonId == entry.SalonId && u.IsActive && u.Role != null && managerRoles.Contains(u.Role.Name))
                .Select(u => u.Id)
                .ToListAsync();
            var svcPart = entry.ServiceName != null ? $" ({entry.ServiceName})" : "";
            foreach (var mgr in managers)
            {
                _db.Notifications.Add(new Notification
                {
                    SalonId   = entry.SalonId,
                    UserId    = mgr,
                    Title     = "Teklif Kabul Edildi",
                    Message   = $"{entry.CustomerName}{svcPart} randevu teklifini kabul etti.",
                    Type      = "success",
                    Link      = "/bekleme",
                    DedupeKey = $"waitlist:accept:{entry.Id}:{mgr}",
                });
            }
            await _db.SaveChangesAsync();

            return Redirect("/bekleme/yanit?result=accepted");
        }
        else
        {
            if (!entry.CustomerId.HasValue)
                await EnsureCustomerAsync(entry, active: false);

            if (entry.CustomerId.HasValue)
            {
                var c = await _db.Customers.FindAsync(entry.CustomerId.Value);
                if (c is not null)
                {
                    var note = $"[{DateTime.UtcNow:dd.MM.yyyy}] E-posta teklifi müşteri tarafından reddedildi.";
                    c.Notes = string.IsNullOrWhiteSpace(c.Notes) ? note : c.Notes + "\n" + note;
                }
            }

            entry.Status      = "Declined";
            entry.DeclineNote = "Müşteri tarafından reddedildi.";
            await _db.SaveChangesAsync();
            return Redirect("/bekleme/yanit?result=declined");
        }
    }

    // PATCH /api/Waitlist/{id}/stylist — stilist ata
    [HttpPatch("{id:guid}/stylist")]
    public async Task<IActionResult> AssignStylist(Guid id, [FromBody] AssignStylistRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries.FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        entry.StylistId = req.StylistId;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Stilist atandı." });
    }

    // DELETE /api/Waitlist/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries.FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        _db.WaitlistEntries.Remove(entry);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi." });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<Customer> EnsureCustomerAsync(WaitlistEntry entry, bool active)
    {
        if (!string.IsNullOrWhiteSpace(entry.CustomerPhone))
        {
            var existing = await _db.Customers
                .FirstOrDefaultAsync(c => c.SalonId == entry.SalonId && c.Phone == entry.CustomerPhone);
            if (existing is not null)
            {
                if (active && existing.CustomerStatus == CustomerStatuses.Inactive)
                    existing.CustomerStatus = CustomerStatuses.Active;
                entry.CustomerId = existing.Id;
                await _db.SaveChangesAsync();
                return existing;
            }
        }

        var fn  = entry.CustomerFirstName ?? entry.CustomerName.Split(' ', 2)[0];
        var ln  = entry.CustomerLastName  ?? (entry.CustomerName.Contains(' ') ? entry.CustomerName.Split(' ', 2)[1] : "");
        var cst = active ? CustomerStatuses.New : CustomerStatuses.Inactive;
        var c   = new Customer
        {
            SalonId        = entry.SalonId,
            FirstName      = fn,
            LastName       = ln,
            Phone          = entry.CustomerPhone,
            Email          = entry.CustomerEmail,
            CustomerStatus = cst,
        };
        _db.Customers.Add(c);
        await _db.SaveChangesAsync();
        entry.CustomerId = c.Id;
        return c;
    }

    private static DateTime? BuildDateTime(DateTime? date, string? timeStr)
    {
        if (date is null) return null;
        if (string.IsNullOrWhiteSpace(timeStr)) return date.Value.Date;
        return TimeSpan.TryParse(timeStr, out var ts) ? date.Value.Date.Add(ts) : date.Value.Date;
    }
}

// ── Auto-notify on appointment cancellation ───────────────────────────────────

public static class WaitlistNotifier
{
    public static async Task NotifyFirstAsync(AppDbContext db, IWhatsAppService wa, Guid salonId, Guid? stylistId, string? serviceName)
    {
        var q = db.WaitlistEntries.Include(w => w.Customer)
            .Where(w => w.SalonId == salonId && w.Status == "Waiting");

        if (stylistId.HasValue)  q = q.Where(w => w.StylistId == null || w.StylistId == stylistId.Value);
        if (serviceName != null) q = q.Where(w => w.ServiceName == null || w.ServiceName == serviceName);

        var entry = await q.OrderBy(w => w.CreatedAtUtc).FirstOrDefaultAsync();
        if (entry is null) return;

        var phone = entry.Customer?.Phone ?? entry.CustomerPhone;
        if (string.IsNullOrWhiteSpace(phone)) return;

        var salon     = await db.Salons.Where(s => s.Id == salonId).Select(s => s.Name).FirstOrDefaultAsync();
        var firstName = entry.Customer?.FirstName ?? entry.CustomerFirstName ?? entry.CustomerName.Split(' ')[0];
        var msg       = $"Merhaba {firstName} 👋\n\n{salon} salonunda beklediğiniz{(entry.ServiceName is not null ? $" {entry.ServiceName}" : "")} için uygun bir randevu açıldı! Lütfen salonumuzu arayın. 📅";

        var (ok, _) = await wa.SendTextAsync(salonId, phone, msg, entry.CustomerId,
            sentByName: "Sistem", messageType: "waitlist_notify");

        if (ok) { entry.Status = "Notified"; await db.SaveChangesAsync(); }
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

public class CreateWaitlistRequest
{
    public Guid      CustomerId        { get; set; }
    public Guid?     StylistId         { get; set; }
    public string?   ServiceName       { get; set; }
    public string?   WaitingType       { get; set; }
    public DateTime? PreferredDate     { get; set; }
    public string?   PreferredTimeFrom { get; set; }
    public string?   PreferredTimeTo   { get; set; }
    public string?   Notes             { get; set; }
}

public class PublicWaitlistRequest
{
    public string    Slug              { get; set; } = "";
    public string?   CustomerName      { get; set; }
    public string?   CustomerFirstName { get; set; }
    public string?   CustomerLastName  { get; set; }
    public string    CustomerPhone     { get; set; } = "";
    public string?   CustomerEmail     { get; set; }
    public Guid?     StylistId         { get; set; }
    public string?   ServiceName       { get; set; }
    public string?   WaitingType       { get; set; }
    public DateTime? PreferredDate     { get; set; }
    public string?   PreferredTimeFrom { get; set; }
    public string?   PreferredTimeTo   { get; set; }
    public string?   Notes             { get; set; }
}

public class SendOfferRequest
{
    public string OfferedDate     { get; set; } = "";  // "2026-05-20"
    public string OfferedTime     { get; set; } = "";  // "14:00"
    public int    DurationMinutes { get; set; } = 60;
}

public class DeclineWaitlistRequest
{
    public string? Reason { get; set; }
}

public class AssignStylistRequest
{
    public Guid? StylistId { get; set; }
}

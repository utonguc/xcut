using System.IdentityModel.Tokens.Jwt;
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

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // GET /api/Waitlist
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.WaitlistEntries
            .Where(w => w.SalonId == salonId.Value)
            .Include(w => w.Customer)
            .Include(w => w.Stylist)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(w => w.Status == status);

        var items = await q
            .OrderBy(w => w.PreferredDate)
            .ThenBy(w => w.CreatedAtUtc)
            .Select(w => new {
                w.Id, w.Status, w.ServiceName, w.PreferredDate, w.Notes, w.CreatedAtUtc, w.Source,
                w.PreferredTimeFrom, w.PreferredTimeTo,
                CustomerName      = w.Customer != null ? w.Customer.FirstName + " " + w.Customer.LastName : w.CustomerName,
                CustomerFirstName = w.Customer != null ? w.Customer.FirstName : w.CustomerFirstName,
                CustomerLastName  = w.Customer != null ? w.Customer.LastName  : w.CustomerLastName,
                CustomerPhone     = w.Customer != null ? w.Customer.Phone     : w.CustomerPhone,
                CustomerEmail     = w.Customer != null ? w.Customer.Email     : w.CustomerEmail,
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
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!await _db.Customers.AnyAsync(c => c.Id == req.CustomerId && c.SalonId == salonId.Value))
            return BadRequest(new { message = "Müşteri bulunamadı." });

        var customer = await _db.Customers.FirstAsync(c => c.Id == req.CustomerId);

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

        var servicePart = entry.ServiceName != null ? $" ({entry.ServiceName})" : "";
        foreach (var mgr in managers)
        {
            _db.Notifications.Add(new Notification
            {
                SalonId    = website.SalonId,
                UserId     = mgr,
                Title      = "Yeni Bekleme Talebi",
                Message    = $"{entry.CustomerName}{servicePart} için online bekleme talebi geldi.",
                Type       = "info",
                Link       = "/bekleme",
                DedupeKey  = $"waitlist:public:{entry.Id}:{mgr}",
            });
        }
        await _db.SaveChangesAsync();

        return Ok(new { entry.Id, message = "Bekleme listesine eklendiniz." });
    }

    // PATCH /api/Waitlist/{id}/status
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateWaitlistStatusRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries
            .FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        if (req.Status == "Booked" && !entry.CustomerId.HasValue)
            await EnsureCustomerAsync(entry);

        entry.Status = req.Status;
        await _db.SaveChangesAsync();
        return Ok(new { entry.Status });
    }

    // POST /api/Waitlist/{id}/approve — approve + optional channel notification
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveWaitlistRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries
            .Include(w => w.Customer)
            .FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        // Create customer record if needed
        if (!entry.CustomerId.HasValue)
        {
            var c = await EnsureCustomerAsync(entry);
            entry.Customer = c;
        }

        entry.Status = "Booked";
        await _db.SaveChangesAsync();

        if (req.Channels.Count == 0)
            return Ok(new { status = entry.Status, message = "Onaylandı." });

        var salonName  = await _db.Salons.Where(s => s.Id == salonId.Value).Select(s => s.Name).FirstOrDefaultAsync() ?? "";
        var firstName  = entry.Customer?.FirstName ?? entry.CustomerFirstName ?? entry.CustomerName.Split(' ')[0];
        var phone      = entry.Customer?.Phone ?? entry.CustomerPhone;
        var email      = entry.Customer?.Email ?? entry.CustomerEmail;

        // Build proposed time string
        var timeLines = new List<string>();
        if (!string.IsNullOrWhiteSpace(req.ProposedDate)) timeLines.Add($"🗓 Tarih: *{req.ProposedDate}*");
        if (!string.IsNullOrWhiteSpace(req.ProposedTime)) timeLines.Add($"⏰ Saat: *{req.ProposedTime}*");
        var timeBlock   = timeLines.Count > 0 ? "\n\n" + string.Join("\n", timeLines) : "";
        var timeHtml    = timeLines.Count > 0
            ? $"<br/><br/><strong>Önerilen randevu:</strong><br/>{req.ProposedDate}{(req.ProposedTime != null ? " · " + req.ProposedTime : "")}"
            : "";

        var warnings = new List<string>();

        // WhatsApp
        if (req.Channels.Contains("whatsapp"))
        {
            if (string.IsNullOrWhiteSpace(phone)) { warnings.Add("WhatsApp: telefon numarası yok"); }
            else
            {
                var msg = $"Merhaba {firstName} 👋\n\n{salonName} salonunda bekleme listeniz onaylandı!{timeBlock}\n\nRandevunuzu kesinleştirmek için lütfen bizi arayın. 📅";
                var (ok, err) = await _wa.SendTextAsync(salonId.Value, phone, msg, entry.CustomerId, sentByName: "Sistem", messageType: "waitlist_approve");
                if (!ok) warnings.Add($"WhatsApp gönderilemedi: {err}");
            }
        }

        // Email
        if (req.Channels.Contains("email"))
        {
            if (string.IsNullOrWhiteSpace(email)) { warnings.Add("E-posta: adres yok"); }
            else
            {
                var subject = $"Bekleme Listeniz Onaylandı — {salonName}";
                var html    = $"<p>Merhaba {firstName},</p><p>{salonName} salonunda bekleme listeniz onaylandı.{timeHtml}</p><p>Randevunuzu kesinleştirmek için lütfen salonumuzu arayın.</p><p>Teşekkürler,<br/>{salonName}</p>";
                await _email.SendAsync(email, subject, html);
            }
        }

        // SMS — altyapı hazır değil
        if (req.Channels.Contains("sms"))
            warnings.Add("SMS altyapısı henüz yapılandırılmamış.");

        return Ok(new { status = entry.Status, warnings });
    }

    // POST /api/Waitlist/{id}/notify — bildirim gönder (onaysız)
    [HttpPost("{id:guid}/notify")]
    public async Task<IActionResult> Notify(Guid id, [FromBody] NotifyWaitlistRequest? req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries
            .Include(w => w.Customer)
            .FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        var channel   = req?.Channel ?? "whatsapp";
        var phone     = entry.Customer?.Phone ?? entry.CustomerPhone;
        var email     = entry.Customer?.Email ?? entry.CustomerEmail;
        var salonName = await _db.Salons.Where(s => s.Id == salonId.Value).Select(s => s.Name).FirstOrDefaultAsync() ?? "";
        var firstName = entry.Customer?.FirstName ?? entry.CustomerFirstName ?? entry.CustomerName.Split(' ')[0];

        string timeBlock = "", timeHtml = "";
        if (!string.IsNullOrWhiteSpace(req?.ProposedDate) || !string.IsNullOrWhiteSpace(req?.ProposedTime))
        {
            var lines = new List<string>();
            if (!string.IsNullOrWhiteSpace(req?.ProposedDate)) lines.Add($"🗓 Tarih: *{req.ProposedDate}*");
            if (!string.IsNullOrWhiteSpace(req?.ProposedTime)) lines.Add($"⏰ Saat: *{req.ProposedTime}*");
            timeBlock = "\n\n" + string.Join("\n", lines);
            timeHtml  = $"<br/><br/><strong>Önerilen randevu:</strong><br/>{req?.ProposedDate}{(req?.ProposedTime != null ? " · " + req.ProposedTime : "")}";
        }

        if (channel == "whatsapp")
        {
            if (string.IsNullOrWhiteSpace(phone))
                return BadRequest(new { message = "Müşterinin telefon numarası yok." });
            var msg  = $"Merhaba {firstName} 👋\n\n{salonName} salonunda beklediğiniz{(entry.ServiceName is not null ? $" {entry.ServiceName}" : "")} için uygun bir slot açıldı!{timeBlock}\n\nRandevunuzu almak için lütfen bizi arayın. 📅";
            var (ok, err) = await _wa.SendTextAsync(salonId.Value, phone, msg, entry.CustomerId, sentByName: "Sistem", messageType: "waitlist_notify");
            if (!ok) return BadRequest(new { message = $"WhatsApp gönderilemedi: {err}" });
        }
        else if (channel == "email")
        {
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new { message = "Müşterinin e-posta adresi yok." });
            var subject = $"Randevu Bildirimi — {salonName}";
            var html    = $"<p>Merhaba {firstName},</p><p>{salonName} salonunda beklediğiniz{(entry.ServiceName != null ? $" {entry.ServiceName}" : "")} için uygun bir randevu açıldı!{timeHtml}</p><p>Lütfen bizi arayın.</p>";
            await _email.SendAsync(email, subject, html);
        }
        else if (channel == "sms")
        {
            return BadRequest(new { message = "SMS altyapısı henüz yapılandırılmamış." });
        }

        entry.Status = "Notified";
        await _db.SaveChangesAsync();
        return Ok(new { message = "Bildirim gönderildi." });
    }

    // DELETE /api/Waitlist/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var entry = await _db.WaitlistEntries.FirstOrDefaultAsync(w => w.Id == id && w.SalonId == salonId.Value);
        if (entry is null) return NotFound();

        _db.WaitlistEntries.Remove(entry);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi." });
    }

    private async Task<Customer> EnsureCustomerAsync(WaitlistEntry entry)
    {
        var firstName = entry.CustomerFirstName ?? entry.CustomerName.Split(' ', 2)[0];
        var lastName  = entry.CustomerLastName  ?? (entry.CustomerName.Contains(' ') ? entry.CustomerName.Split(' ', 2)[1] : "");
        var customer  = new Customer
        {
            SalonId        = entry.SalonId,
            FirstName      = firstName,
            LastName       = lastName,
            Phone          = entry.CustomerPhone,
            Email          = entry.CustomerEmail,
            CustomerStatus = "Yeni",
        };
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        entry.CustomerId = customer.Id;
        return customer;
    }
}

// ── Auto-notify on appointment cancellation ───────────────────────────────────

public static class WaitlistNotifier
{
    public static async Task NotifyFirstAsync(AppDbContext db, IWhatsAppService wa, Guid salonId, Guid? stylistId, string? serviceName)
    {
        var q = db.WaitlistEntries
            .Include(w => w.Customer)
            .Where(w => w.SalonId == salonId && w.Status == "Waiting");

        if (stylistId.HasValue)  q = q.Where(w => w.StylistId == null || w.StylistId == stylistId.Value);
        if (serviceName != null) q = q.Where(w => w.ServiceName == null || w.ServiceName == serviceName);

        var entry = await q.OrderBy(w => w.CreatedAtUtc).FirstOrDefaultAsync();
        if (entry is null) return;

        var phone = entry.Customer?.Phone ?? entry.CustomerPhone;
        if (string.IsNullOrWhiteSpace(phone)) return;

        var salon     = await db.Salons.Where(s => s.Id == salonId).Select(s => s.Name).FirstOrDefaultAsync();
        var firstName = entry.Customer?.FirstName ?? entry.CustomerFirstName ?? entry.CustomerName.Split(' ')[0];
        var msg       = $"Merhaba {firstName} 👋\n\n{salon} salonunda beklediğiniz{(entry.ServiceName is not null ? $" {entry.ServiceName}" : "")} için uygun bir randevu açıldı! Lütfen salonumuzu arayın veya randevunuzu alın. 📅";

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
    public DateTime? PreferredDate     { get; set; }
    public string?   PreferredTimeFrom { get; set; }
    public string?   PreferredTimeTo   { get; set; }
    public string?   Notes             { get; set; }
}

public class PublicWaitlistRequest
{
    public string    Slug              { get; set; } = "";
    // Accept either combined name or separate fields
    public string?   CustomerName      { get; set; }
    public string?   CustomerFirstName { get; set; }
    public string?   CustomerLastName  { get; set; }
    public string    CustomerPhone     { get; set; } = "";
    public string?   CustomerEmail     { get; set; }
    public Guid?     StylistId         { get; set; }
    public string?   ServiceName       { get; set; }
    public DateTime? PreferredDate     { get; set; }
    public string?   PreferredTimeFrom { get; set; }
    public string?   PreferredTimeTo   { get; set; }
    public string?   Notes             { get; set; }
}

public class UpdateWaitlistStatusRequest
{
    public string Status { get; set; } = "";
}

public class ApproveWaitlistRequest
{
    public string?      ProposedDate { get; set; }  // "20 Mayıs Çarşamba"
    public string?      ProposedTime { get; set; }  // "10:00"
    public List<string> Channels     { get; set; } = new();
}

public class NotifyWaitlistRequest
{
    public string  Channel      { get; set; } = "whatsapp"; // whatsapp | email | sms
    public string? ProposedDate { get; set; }
    public string? ProposedTime { get; set; }
}

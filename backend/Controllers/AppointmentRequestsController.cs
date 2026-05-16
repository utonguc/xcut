using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AppointmentRequestsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AppointmentRequestsController(AppDbContext db) => _db = db;

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // POST /api/AppointmentRequests — public, no auth
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] SubmitAppointmentRequestDto dto)
    {
        if (dto.StylistId == Guid.Empty)
            return BadRequest(new { message = "Stilist seçilmedi." });

        if (string.IsNullOrWhiteSpace(dto.CustomerFirstName) || string.IsNullOrWhiteSpace(dto.CustomerLastName))
            return BadRequest(new { message = "Müşteri adı zorunlu." });

        if (dto.RequestedStartUtc >= dto.RequestedEndUtc)
            return BadRequest(new { message = "Geçersiz zaman aralığı." });

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == dto.StylistId && s.IsActive);
        if (stylist is null) return NotFound(new { message = "Stilist bulunamadı." });

        var website = await _db.SalonWebsites
            .FirstOrDefaultAsync(w => w.SalonId == stylist.SalonId && w.IsPublished && w.BookingEnabled);
        if (website is null) return BadRequest(new { message = "Online randevu kapalı." });

        var salonId = stylist.SalonId;
        var emailNorm = dto.CustomerEmail?.Trim().ToLowerInvariant();

        // Find or create customer — email + first-name must both match to avoid
        // assigning a booking to the wrong person when an email is reused.
        Customer? customer = null;
        var firstNorm = dto.CustomerFirstName.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(emailNorm))
            customer = await _db.Customers.FirstOrDefaultAsync(c =>
                c.SalonId == salonId &&
                c.Email == emailNorm &&
                c.FirstName.ToLower() == firstNorm);

        if (customer is null)
        {
            var nameNorm = $"{dto.CustomerFirstName} {dto.CustomerLastName}".Trim().ToLowerInvariant();
            customer = await _db.Customers.FirstOrDefaultAsync(c =>
                c.SalonId == salonId &&
                (c.FirstName + " " + c.LastName).ToLower() == nameNorm);
        }

        if (customer is null)
        {
            customer = new Customer
            {
                SalonId        = salonId,
                FirstName      = dto.CustomerFirstName.Trim(),
                LastName       = dto.CustomerLastName.Trim(),
                Phone          = dto.CustomerPhone?.Trim(),
                Email          = emailNorm,
                CustomerStatus = "Yeni",
            };
            _db.Customers.Add(customer);
            await _db.SaveChangesAsync();
        }

        var req = new AppointmentRequest
        {
            SalonId           = salonId,
            StylistId         = dto.StylistId,
            RequestedStartUtc = dto.RequestedStartUtc,
            RequestedEndUtc   = dto.RequestedEndUtc,
            ServiceName       = dto.ServiceName,
            CustomerFirstName = dto.CustomerFirstName.Trim(),
            CustomerLastName  = dto.CustomerLastName.Trim(),
            CustomerPhone     = dto.CustomerPhone?.Trim(),
            CustomerEmail     = emailNorm,
            CustomerNotes     = dto.CustomerNotes?.Trim(),
            Status            = AppointmentRequestStatuses.Pending,
        };

        _db.AppointmentRequests.Add(req);
        await _db.SaveChangesAsync();

        // Notify all active managers of this salon
        var managerRoles = new[] { "SalonYonetici", "SuperAdmin", "Resepsiyon" };
        var managers = await _db.Users
            .Where(u => u.SalonId == salonId && u.IsActive && u.Role != null && managerRoles.Contains(u.Role.Name))
            .Select(u => u.Id)
            .ToListAsync();

        var localTime = req.RequestedStartUtc.ToLocalTime();
        var notifMsg  = $"{dto.CustomerFirstName} {dto.CustomerLastName} — {localTime:dd MMM HH:mm} ({dto.ServiceName})";
        foreach (var mgr in managers)
        {
            _db.Notifications.Add(new Notification
            {
                SalonId   = salonId,
                UserId    = mgr,
                Title     = "📅 Yeni Online Randevu İsteği",
                Message   = notifMsg,
                Type      = "info",
                Link      = "/appointments",
                DedupeKey = $"booking:{req.Id}:{mgr}",
            });
        }
        if (managers.Count > 0) await _db.SaveChangesAsync();

        return Ok(new { id = req.Id, message = "Randevu talebiniz alındı." });
    }

    // GET /api/AppointmentRequests?status=Pending — salon admin
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> List([FromQuery] string? status)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.AppointmentRequests
            .Include(r => r.Stylist)
            .Where(r => r.SalonId == salonId.Value);

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(r => r.Status == status);

        var items = await q
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new AppointmentRequestResponse
            {
                Id                = r.Id,
                StylistName       = r.Stylist != null ? r.Stylist.FullName : "",
                StylistSpecialty  = r.Stylist != null ? (r.Stylist.Specialty ?? "") : "",
                RequestedStartUtc = r.RequestedStartUtc,
                RequestedEndUtc   = r.RequestedEndUtc,
                ServiceName       = r.ServiceName,
                CustomerFirstName = r.CustomerFirstName,
                CustomerLastName  = r.CustomerLastName,
                CustomerPhone     = r.CustomerPhone,
                CustomerEmail     = r.CustomerEmail,
                CustomerNotes     = r.CustomerNotes,
                Status            = r.Status,
                RejectionReason   = r.RejectionReason,
                CreatedAtUtc      = r.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(items);
    }

    // PATCH /api/AppointmentRequests/{id}/review — approve or reject
    [HttpPatch("{id:guid}/review")]
    [Authorize]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewAppointmentRequestDto dto)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var req = await _db.AppointmentRequests
            .Include(r => r.Stylist)
            .FirstOrDefaultAsync(r => r.Id == id && r.SalonId == salonId.Value);

        if (req is null) return NotFound(new { message = "Talep bulunamadı." });
        if (req.Status != AppointmentRequestStatuses.Pending)
            return BadRequest(new { message = "Bu talep zaten işleme alınmış." });

        if (dto.Action == "approve")
        {
            var startUtc = dto.StartAtUtc ?? req.RequestedStartUtc;
            var endUtc   = dto.EndAtUtc   ?? req.RequestedEndUtc;

            // Find or create customer
            var email = req.CustomerEmail;
            Customer? customer = null;

            if (!string.IsNullOrWhiteSpace(email))
                customer = await _db.Customers.FirstOrDefaultAsync(c => c.SalonId == salonId.Value && c.Email == email);

            if (customer is null)
            {
                var nameNorm = $"{req.CustomerFirstName} {req.CustomerLastName}".ToLowerInvariant();
                customer = await _db.Customers.FirstOrDefaultAsync(c =>
                    c.SalonId == salonId.Value &&
                    (c.FirstName + " " + c.LastName).ToLower() == nameNorm);
            }

            if (customer is null)
            {
                customer = new Customer
                {
                    SalonId   = salonId.Value,
                    FirstName = req.CustomerFirstName,
                    LastName  = req.CustomerLastName,
                    Phone     = req.CustomerPhone,
                    Email     = req.CustomerEmail,
                    CustomerStatus = "Yeni",
                };
                _db.Customers.Add(customer);
                await _db.SaveChangesAsync();
            }

            var appt = new Appointment
            {
                SalonId     = salonId.Value,
                CustomerId  = customer.Id,
                StylistId   = req.StylistId,
                ServiceName = dto.ServiceName ?? req.ServiceName,
                StartAtUtc  = startUtc,
                EndAtUtc    = endUtc,
                Notes       = req.CustomerNotes,
                Status      = "Scheduled",
            };
            _db.Appointments.Add(appt);

            req.Status               = AppointmentRequestStatuses.Approved;
            req.CreatedAppointmentId = appt.Id;
            req.ReviewedAtUtc        = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            return Ok(new { status = "Approved", appointmentId = appt.Id });
        }
        else if (dto.Action == "reject")
        {
            req.Status          = AppointmentRequestStatuses.Rejected;
            req.RejectionReason = dto.RejectionReason?.Trim();
            req.ReviewedAtUtc   = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(new { status = "Rejected" });
        }
        else
        {
            return BadRequest(new { message = "Geçersiz aksiyon. 'approve' veya 'reject' kullanın." });
        }
    }
}

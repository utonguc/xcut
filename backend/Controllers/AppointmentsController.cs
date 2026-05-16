// Controllers/AppointmentsController.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AppointmentsController : ControllerBase
{
    private readonly AppDbContext           _db;
    private readonly IAuditService          _audit;
    private readonly KioskEventBroadcaster  _kioskBroadcaster;
    private readonly IWhatsAppService       _wa;
    private readonly IGoogleCalendarService _gcal;
    private static readonly TimeSpan ConflictBuffer = TimeSpan.FromMinutes(5);

    private static readonly HashSet<string> ValidStatuses =
        new() { "Scheduled", "InProgress", "Late", "Completed", "Cancelled", "NoShow" };

    public AppointmentsController(AppDbContext db, IAuditService audit, KioskEventBroadcaster kioskBroadcaster, IWhatsAppService wa, IGoogleCalendarService gcal)
    {
        _db               = db;
        _audit            = audit;
        _kioskBroadcaster = kioskBroadcaster;
        _wa               = wa;
        _gcal             = gcal;
    }

    private Guid? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // GET api/appointments?start=&end=&stylistId=&customerId=&status=
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] DateTime? start,
        [FromQuery] DateTime? end,
        [FromQuery] Guid?     stylistId,
        [FromQuery] Guid?     customerId,
        [FromQuery] string?   status)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var query = _db.Appointments
            .Where(x => x.SalonId == salonId.Value)
            .AsQueryable();

        if (stylistId.HasValue)  query = query.Where(x => x.StylistId  == stylistId.Value);
        if (customerId.HasValue) query = query.Where(x => x.CustomerId == customerId.Value);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);

        if (start.HasValue && end.HasValue)
            query = query.Where(x => x.StartAtUtc < end.Value && x.EndAtUtc > start.Value);
        else if (start.HasValue)
            query = query.Where(x => x.EndAtUtc > start.Value);
        else if (end.HasValue)
            query = query.Where(x => x.StartAtUtc < end.Value);

        var items = await query
            .OrderBy(x => x.StartAtUtc)
            .Select(x => new AppointmentResponse
            {
                Id               = x.Id,
                CustomerId       = x.CustomerId,
                CustomerFullName = x.Customer!.FirstName + " " + x.Customer.LastName,
                StylistId        = x.StylistId,
                StylistFullName  = x.Stylist!.FullName,
                ServiceId        = x.ServiceId,
                ServiceName      = x.ServiceName,
                StartAtUtc       = x.StartAtUtc,
                EndAtUtc         = x.EndAtUtc,
                Notes            = x.Notes,
                Status           = x.Status,
                CreatedAtUtc     = x.CreatedAtUtc
            })
            .ToListAsync();

        return Ok(items);
    }

    // GET api/appointments/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var item = await _db.Appointments
            .Where(x => x.Id == id && x.SalonId == salonId.Value)
            .Select(x => new AppointmentResponse
            {
                Id               = x.Id,
                CustomerId       = x.CustomerId,
                CustomerFullName = x.Customer!.FirstName + " " + x.Customer.LastName,
                StylistId        = x.StylistId,
                StylistFullName  = x.Stylist!.FullName,
                ServiceId        = x.ServiceId,
                ServiceName      = x.ServiceName,
                StartAtUtc       = x.StartAtUtc,
                EndAtUtc         = x.EndAtUtc,
                Notes            = x.Notes,
                Status           = x.Status,
                CreatedAtUtc     = x.CreatedAtUtc
            })
            .FirstOrDefaultAsync();

        if (item is null) return NotFound("Randevu bulunamadı.");
        return Ok(item);
    }

    // POST api/appointments
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAppointmentRequest request)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var validation = await ValidateRequestAsync(salonId.Value,
            request.CustomerId, request.StylistId,
            request.ServiceName, request.StartAtUtc, request.EndAtUtc, null);
        if (validation is not null) return validation;

        var appointment = new Appointment
        {
            SalonId     = salonId.Value,
            CustomerId  = request.CustomerId,
            StylistId   = request.StylistId,
            ServiceId   = request.ServiceId,
            ServiceName = request.ServiceName,
            StartAtUtc  = request.StartAtUtc,
            EndAtUtc    = request.EndAtUtc,
            Notes       = request.Notes,
            Status      = "Scheduled"
        };

        _db.Appointments.Add(appointment);
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Appointment", appointment.Id.ToString(), "Create",
            $"Randevu oluşturuldu: {appointment.ServiceName} — {appointment.StartAtUtc:dd.MM.yyyy HH:mm}");

        // Push to Google Calendar (salon + stylist personal)
        var cName = await _db.Customers.Where(x => x.Id == request.CustomerId)
            .Select(x => x.FirstName + " " + x.LastName).FirstOrDefaultAsync() ?? "";
        var sName = await _db.Stylists.Where(x => x.Id == request.StylistId)
            .Select(x => x.FullName).FirstOrDefaultAsync() ?? "";
        var gcalId       = await _gcal.PushEventAsync(salonId.Value, appointment, cName, sName);
        var stylistCalId = await _gcal.PushEventForStylistAsync(salonId.Value, appointment.StylistId, appointment, cName, sName);
        if (gcalId       != null) appointment.GcalEventId        = gcalId;
        if (stylistCalId != null) appointment.GcalStylistEventId = stylistCalId;
        if (gcalId != null || stylistCalId != null) await _db.SaveChangesAsync();
        _ = _gcal.PushEventForManagersAsync(salonId.Value, appointment, cName, sName);

        return Ok(appointment.Id);
    }

    // PUT api/appointments/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAppointmentRequest request)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var appointment = await _db.Appointments
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (appointment is null) return NotFound("Randevu bulunamadı.");

        if (appointment.Status == "Cancelled")
            return BadRequest(new { message = "İptal edilmiş randevu düzenlenemez." });

        var validation = await ValidateRequestAsync(salonId.Value,
            request.CustomerId, request.StylistId,
            request.ServiceName, request.StartAtUtc, request.EndAtUtc, id);
        if (validation is not null) return validation;

        appointment.CustomerId   = request.CustomerId;
        appointment.StylistId    = request.StylistId;
        appointment.ServiceId    = request.ServiceId;
        appointment.ServiceName  = request.ServiceName;
        appointment.StartAtUtc   = request.StartAtUtc;
        appointment.EndAtUtc     = request.EndAtUtc;
        appointment.Notes        = request.Notes;
        appointment.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Sync to Google Calendar (salon + stylist personal)
        var cName = await _db.Customers.Where(x => x.Id == appointment.CustomerId)
            .Select(x => x.FirstName + " " + x.LastName).FirstOrDefaultAsync() ?? "";
        var sName = await _db.Stylists.Where(x => x.Id == appointment.StylistId)
            .Select(x => x.FullName).FirstOrDefaultAsync() ?? "";
        if (!string.IsNullOrEmpty(appointment.GcalEventId))
            _ = _gcal.UpdateEventAsync(salonId.Value, appointment.GcalEventId, appointment, cName, sName);
        else
        {
            var gcalId = await _gcal.PushEventAsync(salonId.Value, appointment, cName, sName);
            if (gcalId != null) { appointment.GcalEventId = gcalId; await _db.SaveChangesAsync(); }
        }
        if (!string.IsNullOrEmpty(appointment.GcalStylistEventId))
            _ = _gcal.UpdateEventForStylistAsync(salonId.Value, appointment.StylistId, appointment.GcalStylistEventId, appointment, cName, sName);
        else
        {
            var stylistCalId = await _gcal.PushEventForStylistAsync(salonId.Value, appointment.StylistId, appointment, cName, sName);
            if (stylistCalId != null) { appointment.GcalStylistEventId = stylistCalId; await _db.SaveChangesAsync(); }
        }

        return Ok(appointment.Id);
    }

    // PATCH api/appointments/{id}/status
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateAppointmentStatusRequest request)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!ValidStatuses.Contains(request.Status))
            return BadRequest(new { message = $"Geçersiz status. Geçerli değerler: {string.Join(", ", ValidStatuses)}" });

        var appointment = await _db.Appointments
            .Include(a => a.Customer)
            .Include(a => a.Stylist)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (appointment is null) return NotFound("Randevu bulunamadı.");

        appointment.Status       = request.Status;
        appointment.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Appointment", id.ToString(), "Update",
            $"Randevu durumu güncellendi: {appointment.ServiceName} → {appointment.Status}");

        var customerName = appointment.Customer != null
            ? $"{appointment.Customer.FirstName} {appointment.Customer.LastName}"
            : "Müşteri";
        var payload = System.Text.Json.JsonSerializer.Serialize(new
        {
            id           = appointment.Id,
            status       = appointment.Status,
            customerName,
            stylistName  = appointment.Stylist?.FullName,
            serviceName  = appointment.ServiceName,
            startAtUtc   = appointment.StartAtUtc,
        });
        _kioskBroadcaster.Broadcast(salonId.Value, "queue_update", payload);

        // When cancelled → notify first waitlist entry + delete calendar events
        if (request.Status == "Cancelled")
        {
            _ = WaitlistNotifier.NotifyFirstAsync(_db, _wa, salonId.Value, appointment.StylistId, appointment.ServiceName);
            if (!string.IsNullOrEmpty(appointment.GcalEventId))
                _ = _gcal.DeleteEventAsync(salonId.Value, appointment.GcalEventId);
            if (!string.IsNullOrEmpty(appointment.GcalStylistEventId))
                _ = _gcal.DeleteEventForStylistAsync(salonId.Value, appointment.StylistId, appointment.GcalStylistEventId);
        }

        return Ok(new { id = appointment.Id, status = appointment.Status });
    }

    // PATCH api/appointments/{id}/extend  — adds minutes to EndAtUtc (no conflict check)
    [HttpPatch("{id:guid}/extend")]
    public async Task<IActionResult> Extend(Guid id, [FromBody] ExtendRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        var appt = await _db.Appointments
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (appt is null) return NotFound();
        appt.EndAtUtc      = appt.EndAtUtc.AddMinutes(req.Minutes);
        appt.UpdatedAtUtc  = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { endAtUtc = appt.EndAtUtc });
    }

    // POST api/appointments/shift-stylist  — cascade-shift scheduled appts after a point in time
    [HttpPost("shift-stylist")]
    public async Task<IActionResult> ShiftStylist([FromBody] ShiftStylistRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        var appts = await _db.Appointments
            .Where(x => x.SalonId == salonId.Value
                     && x.StylistId == req.StylistId
                     && x.StartAtUtc >= req.AfterUtc
                     && (x.Status == "Scheduled" || x.Status == "Late"))
            .ToListAsync();
        foreach (var a in appts)
        {
            a.StartAtUtc   = a.StartAtUtc.AddMinutes(req.ShiftMinutes);
            a.EndAtUtc     = a.EndAtUtc.AddMinutes(req.ShiftMinutes);
            a.UpdatedAtUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
        return Ok(new { shifted = appts.Count });
    }

    // DELETE api/appointments/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var appointment = await _db.Appointments
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (appointment is null) return NotFound("Randevu bulunamadı.");

        var info = $"{appointment.ServiceName} — {appointment.StartAtUtc:dd.MM.yyyy HH:mm}";
        if (!string.IsNullOrEmpty(appointment.GcalEventId))
            _ = _gcal.DeleteEventAsync(salonId.Value, appointment.GcalEventId);
        if (!string.IsNullOrEmpty(appointment.GcalStylistEventId))
            _ = _gcal.DeleteEventForStylistAsync(salonId.Value, appointment.StylistId, appointment.GcalStylistEventId);
        _db.Appointments.Remove(appointment);
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Appointment", id.ToString(), "Delete",
            $"Randevu silindi: {info}");
        return NoContent();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private async Task<IActionResult?> ValidateRequestAsync(
        Guid salonId, Guid customerId, Guid stylistId,
        string serviceName, DateTime startAtUtc, DateTime endAtUtc,
        Guid? excludeId)
    {
        if (customerId == Guid.Empty) return BadRequest(new { message = "CustomerId zorunlu." });
        if (stylistId  == Guid.Empty) return BadRequest(new { message = "StylistId zorunlu." });
        if (string.IsNullOrWhiteSpace(serviceName))
            return BadRequest(new { message = "ServiceName zorunlu." });
        if (startAtUtc >= endAtUtc)
            return BadRequest(new { message = "Bitiş zamanı başlangıçtan sonra olmalıdır." });

        var customerExists = await _db.Customers.AnyAsync(x => x.Id == customerId && x.SalonId == salonId);
        if (!customerExists) return NotFound(new { message = "Müşteri bulunamadı." });

        var stylistExists = await _db.Stylists.AnyAsync(x => x.Id == stylistId && x.SalonId == salonId && x.IsActive);
        if (!stylistExists) return NotFound(new { message = "Aktif stilist bulunamadı." });

        var bufferedStart = startAtUtc.Subtract(ConflictBuffer);
        var bufferedEnd   = endAtUtc.Add(ConflictBuffer);

        var conflictQuery = _db.Appointments.Where(x =>
            x.SalonId   == salonId &&
            x.StylistId == stylistId &&
            x.Status    != "Cancelled" &&
            x.StartAtUtc < bufferedEnd &&
            x.EndAtUtc   > bufferedStart);

        if (excludeId.HasValue)
            conflictQuery = conflictQuery.Where(x => x.Id != excludeId.Value);

        if (await conflictQuery.AnyAsync())
            return Conflict(new { message = "Bu stilist için bu zaman aralığında başka bir randevu mevcut." });

        return null;
    }
}

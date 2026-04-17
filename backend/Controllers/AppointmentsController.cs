// Controllers/AppointmentsController.cs
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
[Authorize]
public class AppointmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly TimeSpan ConflictBuffer = TimeSpan.FromMinutes(5);

    private static readonly HashSet<string> ValidStatuses =
        new() { "Scheduled", "Completed", "Cancelled", "NoShow" };

    public AppointmentsController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
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
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (appointment is null) return NotFound("Randevu bulunamadı.");

        appointment.Status       = request.Status;
        appointment.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { id = appointment.Id, status = appointment.Status });
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

        _db.Appointments.Remove(appointment);
        await _db.SaveChangesAsync();
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

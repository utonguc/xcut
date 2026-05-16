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
public class StylistScheduleController : ControllerBase
{
    private readonly AppDbContext _db;
    public StylistScheduleController(AppDbContext db) { _db = db; }

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // GET /api/StylistSchedule/{id}  → returns 7-day schedule
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var rows = await _db.StylistSchedules
            .Where(s => s.StylistId == id && s.SalonId == salonId.Value)
            .ToListAsync();

        var result = Enumerable.Range(0, 7).Select(dow =>
        {
            var r = rows.FirstOrDefault(s => s.DayOfWeek == dow);
            return new
            {
                dayOfWeek   = dow,
                isWorking   = r?.IsActive ?? (dow >= 1 && dow <= 6),
                startTime   = r?.StartTime.ToString(@"hh\:mm") ?? "09:00",
                endTime     = r?.EndTime.ToString(@"hh\:mm") ?? "18:00",
                slotMinutes = r?.SlotMinutes ?? 30,
            };
        }).ToList();

        return Ok(result);
    }

    // PUT /api/StylistSchedule/{id}  → saves all 7 days
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Put(Guid id, [FromBody] List<ScheduleDayDto> days)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == id && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound(new { message = "Stilist bulunamadı." });

        var existing = await _db.StylistSchedules
            .Where(s => s.StylistId == id && s.SalonId == salonId.Value)
            .ToListAsync();

        foreach (var day in days)
        {
            if (!TimeSpan.TryParse(day.StartTime, out var start)) start = new TimeSpan(9, 0, 0);
            if (!TimeSpan.TryParse(day.EndTime,   out var end))   end   = new TimeSpan(18, 0, 0);

            var row = existing.FirstOrDefault(s => s.DayOfWeek == day.DayOfWeek);
            if (row is null)
            {
                _db.StylistSchedules.Add(new StylistSchedule
                {
                    StylistId   = id,
                    SalonId     = salonId.Value,
                    DayOfWeek   = day.DayOfWeek,
                    StartTime   = start,
                    EndTime     = end,
                    SlotMinutes = day.SlotMinutes > 0 ? day.SlotMinutes : 30,
                    IsActive    = day.IsWorking,
                });
            }
            else
            {
                row.IsActive    = day.IsWorking;
                row.StartTime   = start;
                row.EndTime     = end;
                row.SlotMinutes = day.SlotMinutes > 0 ? day.SlotMinutes : 30;
            }
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // GET /api/StylistSchedule/{id}/leaves
    [HttpGet("{id:guid}/leaves")]
    public async Task<IActionResult> GetLeaves(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var leaves = await _db.StylistLeaves
            .Where(l => l.StylistId == id && l.SalonId == salonId.Value)
            .OrderByDescending(l => l.StartAtUtc)
            .Select(l => new
            {
                id        = l.Id,
                startDate = l.StartAtUtc.ToString("yyyy-MM-dd"),
                endDate   = l.EndAtUtc.ToString("yyyy-MM-dd"),
                reason    = l.Reason,
            })
            .ToListAsync();

        return Ok(leaves);
    }

    // POST /api/StylistSchedule/{id}/leaves
    [HttpPost("{id:guid}/leaves")]
    public async Task<IActionResult> AddLeave(Guid id, [FromBody] ScheduleLeaveDto req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == id && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound(new { message = "Stilist bulunamadı." });

        if (!DateOnly.TryParse(req.StartDate, out var start))
            return BadRequest(new { message = "Geçersiz başlangıç tarihi." });
        if (!DateOnly.TryParse(req.EndDate, out var end))
            return BadRequest(new { message = "Geçersiz bitiş tarihi." });

        _db.StylistLeaves.Add(new StylistLeave
        {
            StylistId  = id,
            SalonId    = salonId.Value,
            StartAtUtc = start.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            EndAtUtc   = end.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            Reason     = req.Reason,
            LeaveType  = "Mazeret",
        });

        await _db.SaveChangesAsync();
        return Ok();
    }

    // DELETE /api/StylistSchedule/{id}/leaves/{leaveId}
    [HttpDelete("{id:guid}/leaves/{leaveId:guid}")]
    public async Task<IActionResult> DeleteLeave(Guid id, Guid leaveId)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var leave = await _db.StylistLeaves
            .FirstOrDefaultAsync(l => l.Id == leaveId && l.StylistId == id && l.SalonId == salonId.Value);
        if (leave is null) return NotFound();

        _db.StylistLeaves.Remove(leave);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public class ScheduleDayDto
{
    public int    DayOfWeek   { get; set; }
    public bool   IsWorking   { get; set; }
    public string StartTime   { get; set; } = "09:00";
    public string EndTime     { get; set; } = "18:00";
    public int    SlotMinutes { get; set; } = 30;
}

public class ScheduleLeaveDto
{
    public string  StartDate { get; set; } = string.Empty;
    public string  EndDate   { get; set; } = string.Empty;
    public string? Reason    { get; set; }
}

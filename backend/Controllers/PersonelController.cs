using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PersonelController : ControllerBase
{
    private readonly AppDbContext _db;
    public PersonelController(AppDbContext db) { _db = db; }

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    // GET /api/Personel/attendance?year=2026&month=5
    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendance([FromQuery] int year, [FromQuery] int month)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var from = new DateOnly(year, month, 1);
        var to   = from.AddMonths(1).AddDays(-1);

        var rows = await _db.StylistAttendances
            .Where(a => a.SalonId == salonId.Value && a.Date >= from && a.Date <= to)
            .Select(a => new
            {
                a.Id, a.StylistId, a.Status,
                Date     = a.Date.ToString("yyyy-MM-dd"),
                a.CheckIn, a.CheckOut, a.Note,
            })
            .ToListAsync();

        return Ok(rows);
    }

    // PUT /api/Personel/attendance — upsert a single day entry
    [HttpPut("attendance")]
    public async Task<IActionResult> UpsertAttendance([FromBody] UpsertAttendanceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!DateOnly.TryParse(req.Date, out var date)) return BadRequest(new { message = "Geçersiz tarih." });

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == req.StylistId && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound(new { message = "Stilist bulunamadı." });

        var existing = await _db.StylistAttendances
            .FirstOrDefaultAsync(a => a.StylistId == req.StylistId && a.Date == date);

        if (existing is null)
        {
            _db.StylistAttendances.Add(new StylistAttendance
            {
                SalonId   = salonId.Value,
                StylistId = req.StylistId,
                Date      = date,
                Status    = req.Status,
                CheckIn   = req.CheckIn,
                CheckOut  = req.CheckOut,
                Note      = req.Note,
            });
        }
        else
        {
            existing.Status   = req.Status;
            existing.CheckIn  = req.CheckIn;
            existing.CheckOut = req.CheckOut;
            existing.Note     = req.Note;
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // GET /api/Personel/leaves?stylistId=...
    [HttpGet("leaves")]
    public async Task<IActionResult> GetLeaves([FromQuery] Guid? stylistId = null)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.StylistLeaves
            .Include(l => l.Stylist)
            .Where(l => l.Stylist!.SalonId == salonId.Value)
            .AsQueryable();

        if (stylistId.HasValue) q = q.Where(l => l.StylistId == stylistId.Value);

        var leaves = await q
            .OrderByDescending(l => l.StartAtUtc)
            .Select(l => new
            {
                l.Id, l.StylistId,
                StylistName = l.Stylist!.FullName,
                StartDate   = l.StartAtUtc.ToString("yyyy-MM-dd"),
                EndDate     = l.EndAtUtc.ToString("yyyy-MM-dd"),
                LeaveType   = l.LeaveType ?? "Mazeret",
                l.Reason,
            })
            .ToListAsync();

        return Ok(leaves);
    }

    // POST /api/Personel/leaves
    [HttpPost("leaves")]
    public async Task<IActionResult> CreateLeave([FromBody] CreatePersonelLeaveRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!DateOnly.TryParse(req.StartDate, out var start))
            return BadRequest(new { message = "Geçersiz başlangıç tarihi." });
        if (!DateOnly.TryParse(req.EndDate, out var end))
            return BadRequest(new { message = "Geçersiz bitiş tarihi." });
        if (start > end)
            return BadRequest(new { message = "Bitiş tarihi başlangıçtan önce olamaz." });

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == req.StylistId && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound(new { message = "Stilist bulunamadı." });

        var leave = new StylistLeave
        {
            StylistId  = req.StylistId,
            SalonId    = salonId.Value,
            StartAtUtc = start.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            EndAtUtc   = end.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            Reason     = req.Note,
            LeaveType  = req.LeaveType,
        };
        _db.StylistLeaves.Add(leave);
        await _db.SaveChangesAsync();
        return Ok(new { leave.Id });
    }

    // DELETE /api/Personel/leaves/{id}
    [HttpDelete("leaves/{id:guid}")]
    public async Task<IActionResult> DeleteLeave(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var leave = await _db.StylistLeaves
            .Include(l => l.Stylist)
            .FirstOrDefaultAsync(l => l.Id == id && l.Stylist!.SalonId == salonId.Value);
        if (leave is null) return NotFound();

        _db.StylistLeaves.Remove(leave);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/Personel/summary?year=2026&month=5
    [HttpGet("summary")]
    public async Task<IActionResult> MonthlySummary([FromQuery] int year, [FromQuery] int month)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var from = new DateOnly(year, month, 1);
        var to   = from.AddMonths(1).AddDays(-1);
        int workingDays = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1)
            .Count(d => { var dow = from.AddDays(d).DayOfWeek; return dow != DayOfWeek.Sunday; });

        var stylists = await _db.Stylists
            .Where(s => s.SalonId == salonId.Value && s.IsActive)
            .ToListAsync();

        var attendances = await _db.StylistAttendances
            .Where(a => a.SalonId == salonId.Value && a.Date >= from && a.Date <= to)
            .ToListAsync();

        var result = stylists.Select(s =>
        {
            var sa = attendances.Where(a => a.StylistId == s.Id).ToList();
            return new
            {
                s.Id, s.FullName, s.PayType, s.FixedSalary, s.CommissionRate,
                Present     = sa.Count(a => a.Status == "present"),
                Absent      = sa.Count(a => a.Status == "absent"),
                Leave       = sa.Count(a => a.Status == "leave"),
                Holiday     = sa.Count(a => a.Status == "holiday"),
                WorkingDays = workingDays,
            };
        });

        return Ok(result);
    }
}

public class UpsertAttendanceRequest
{
    public Guid    StylistId { get; set; }
    public string  Date      { get; set; } = string.Empty;
    public string  Status    { get; set; } = "present";
    public string? CheckIn   { get; set; }
    public string? CheckOut  { get; set; }
    public string? Note      { get; set; }
}

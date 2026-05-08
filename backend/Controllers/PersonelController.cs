using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
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

    private Guid? GetCurrentUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    // Returns (isSelfOnly, linkedStylistId) for the calling user
    private async Task<(bool isSelfOnly, Guid? stylistId)> GetSelfContextAsync()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return (false, null);

        var user = await _db.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (user is null) return (false, null);

        bool isSelfOnly = false;
        var groups = await _db.UserPermissionGroups
            .Where(x => x.UserId == userId.Value)
            .Include(x => x.Group)
            .Select(x => x.Group!)
            .ToListAsync();

        if (groups.Count > 0)
            isSelfOnly = groups.Any(g => g.IsSelfOnly);
        else
            isSelfOnly = user.Role?.Name == "Stilist";

        if (!isSelfOnly) return (false, null);

        var stylist = await _db.Stylists
            .Where(s => s.SalonId == user.SalonId && s.Email != null && s.Email.ToLower() == user.Email.ToLower())
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync();

        return (true, stylist);
    }

    private async Task CreateNotificationAsync(Guid salonId, Guid userId, string title, string message, string? link = null)
    {
        // avoid duplicate via dedupeKey = userId:message
        var dedupeKey = $"leave:{userId}:{message.GetHashCode()}";
        var exists = await _db.Notifications.AnyAsync(n => n.DedupeKey == dedupeKey && !n.IsRead);
        if (exists) return;

        _db.Notifications.Add(new Notification
        {
            SalonId     = salonId,
            UserId      = userId,
            Title       = title,
            Message     = message,
            Type        = "info",
            Link        = link,
            DedupeKey   = dedupeKey,
        });
        await _db.SaveChangesAsync();
    }

    // ── Weekly Off Days ───────────────────────────────────────────────────────

    // GET /api/Personel/weekly-off
    [HttpGet("weekly-off")]
    public async Task<IActionResult> GetWeeklyOff()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        var salon = await _db.Salons.FirstOrDefaultAsync(s => s.Id == salonId.Value);
        return Ok(new { days = salon?.WeeklyOffDays ?? "0" });
    }

    // PUT /api/Personel/weekly-off
    [HttpPut("weekly-off")]
    public async Task<IActionResult> SetWeeklyOff([FromBody] WeeklyOffRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        var salon = await _db.Salons.FirstOrDefaultAsync(s => s.Id == salonId.Value);
        if (salon is null) return NotFound();
        salon.WeeklyOffDays = req.Days ?? "0";
        await _db.SaveChangesAsync();
        return Ok();
    }

    // ── Attendance ────────────────────────────────────────────────────────────

    // GET /api/Personel/attendance?year=&month=
    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendance([FromQuery] int year, [FromQuery] int month)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly, selfStylistId) = await GetSelfContextAsync();

        var from = new DateOnly(year, month, 1);
        var to   = from.AddMonths(1).AddDays(-1);

        var q = _db.StylistAttendances
            .Where(a => a.SalonId == salonId.Value && a.Date >= from && a.Date <= to);

        if (isSelfOnly && selfStylistId.HasValue)
            q = q.Where(a => a.StylistId == selfStylistId.Value);

        var rows = await q
            .Select(a => new
            {
                a.Id, a.StylistId, a.Status, a.IsHalfDay,
                Date    = a.Date.ToString("yyyy-MM-dd"),
                a.CheckIn, a.CheckOut, a.Note,
            })
            .ToListAsync();

        return Ok(rows);
    }

    // PUT /api/Personel/attendance — upsert single day (managers only, not self-only users)
    [HttpPut("attendance")]
    public async Task<IActionResult> UpsertAttendance([FromBody] UpsertAttendanceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly, _) = await GetSelfContextAsync();
        if (isSelfOnly) return Forbid();

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
                IsHalfDay = req.IsHalfDay,
                CheckIn   = req.CheckIn,
                CheckOut  = req.CheckOut,
                Note      = req.Note,
            });
        }
        else
        {
            existing.Status    = req.Status;
            existing.IsHalfDay = req.IsHalfDay;
            existing.CheckIn   = req.CheckIn;
            existing.CheckOut  = req.CheckOut;
            existing.Note      = req.Note;
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // DELETE /api/Personel/attendance?stylistId=&date= (managers only)
    [HttpDelete("attendance")]
    public async Task<IActionResult> DeleteAttendance([FromQuery] Guid stylistId, [FromQuery] string date)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly, _) = await GetSelfContextAsync();
        if (isSelfOnly) return Forbid();

        if (!DateOnly.TryParse(date, out var d)) return BadRequest(new { message = "Geçersiz tarih." });

        var row = await _db.StylistAttendances
            .FirstOrDefaultAsync(a => a.StylistId == stylistId && a.Date == d && a.SalonId == salonId.Value);
        if (row is not null)
        {
            _db.StylistAttendances.Remove(row);
            await _db.SaveChangesAsync();
        }
        return NoContent();
    }

    // ── Leaves ────────────────────────────────────────────────────────────────

    // GET /api/Personel/leaves?stylistId=
    [HttpGet("leaves")]
    public async Task<IActionResult> GetLeaves([FromQuery] Guid? stylistId = null)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly, selfStylistId) = await GetSelfContextAsync();

        var q = _db.StylistLeaves
            .Include(l => l.Stylist)
            .Where(l => l.Stylist!.SalonId == salonId.Value)
            .AsQueryable();

        if (isSelfOnly && selfStylistId.HasValue)
            q = q.Where(l => l.StylistId == selfStylistId.Value);
        else if (stylistId.HasValue)
            q = q.Where(l => l.StylistId == stylistId.Value);

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

        var (isSelfOnly2, _) = await GetSelfContextAsync();
        if (isSelfOnly2) return Forbid();

        if (!DateOnly.TryParse(req.StartDate, out var start)) return BadRequest(new { message = "Geçersiz başlangıç tarihi." });
        if (!DateOnly.TryParse(req.EndDate,   out var end))   return BadRequest(new { message = "Geçersiz bitiş tarihi." });
        if (start > end) return BadRequest(new { message = "Bitiş tarihi başlangıçtan önce olamaz." });

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

    // DELETE /api/Personel/leaves/{id} (managers only)
    [HttpDelete("leaves/{id:guid}")]
    public async Task<IActionResult> DeleteLeave(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly3, _) = await GetSelfContextAsync();
        if (isSelfOnly3) return Forbid();

        var leave = await _db.StylistLeaves
            .Include(l => l.Stylist)
            .FirstOrDefaultAsync(l => l.Id == id && l.Stylist!.SalonId == salonId.Value);
        if (leave is null) return NotFound();

        _db.StylistLeaves.Remove(leave);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Leave Requests (approval workflow) ───────────────────────────────────

    // GET /api/Personel/leave-requests?status=Pending
    [HttpGet("leave-requests")]
    public async Task<IActionResult> GetLeaveRequests([FromQuery] string? status = null)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly4, selfStylistId4) = await GetSelfContextAsync();

        var q = _db.PersonelLeaveRequests
            .Include(r => r.Stylist)
            .Where(r => r.SalonId == salonId.Value)
            .AsQueryable();

        if (isSelfOnly4 && selfStylistId4.HasValue)
            q = q.Where(r => r.StylistId == selfStylistId4.Value);

        if (!string.IsNullOrEmpty(status)) q = q.Where(r => r.Status == status);

        var items = await q
            .OrderByDescending(r => r.RequestedAt)
            .Select(r => new LeaveRequestResponse
            {
                Id           = r.Id,
                StylistId    = r.StylistId,
                StylistName  = r.Stylist!.FullName,
                LeaveType    = r.LeaveType,
                StartDate    = r.StartDate.ToString("yyyy-MM-dd"),
                EndDate      = r.EndDate.ToString("yyyy-MM-dd"),
                IsHalfDay    = r.IsHalfDay,
                Note         = r.Note,
                Status       = r.Status,
                RequestedAt  = r.RequestedAt,
                RejectReason = r.RejectReason,
            })
            .ToListAsync();

        return Ok(items);
    }

    // POST /api/Personel/leave-requests
    [HttpPost("leave-requests")]
    public async Task<IActionResult> CreateLeaveRequest([FromBody] CreateLeaveRequestDto req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!DateOnly.TryParse(req.StartDate, out var start)) return BadRequest(new { message = "Geçersiz başlangıç tarihi." });
        if (!DateOnly.TryParse(req.EndDate,   out var end))   return BadRequest(new { message = "Geçersiz bitiş tarihi." });
        if (start > end) return BadRequest(new { message = "Bitiş tarihi başlangıçtan önce olamaz." });

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == req.StylistId && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound(new { message = "Stilist bulunamadı." });

        var item = new PersonelLeaveRequest
        {
            SalonId   = salonId.Value,
            StylistId = req.StylistId,
            LeaveType = req.LeaveType,
            StartDate = start,
            EndDate   = end,
            IsHalfDay = req.IsHalfDay,
            Note      = req.Note,
        };
        _db.PersonelLeaveRequests.Add(item);
        await _db.SaveChangesAsync();

        // Notify the approver (or salon manager if no approver set)
        Guid? notifyUserId = stylist.ApproverId;
        if (!notifyUserId.HasValue)
        {
            notifyUserId = await _db.Users
                .Where(u => u.SalonId == salonId.Value && u.IsActive && u.Role != null &&
                           (u.Role.Name == "SalonYonetici" || u.Role.Name == "Admin"))
                .Select(u => (Guid?)u.Id)
                .FirstOrDefaultAsync();
        }
        if (notifyUserId.HasValue)
        {
            await CreateNotificationAsync(
                salonId.Value,
                notifyUserId.Value,
                "Yeni İzin Talebi",
                $"{stylist.FullName} — {req.LeaveType} izin talebinde bulundu ({req.StartDate} / {req.EndDate})",
                "/personel?tab=talepler"
            );
        }

        return Ok(new { item.Id });
    }

    // PATCH /api/Personel/leave-requests/{id}/approve (managers only)
    [HttpPatch("leave-requests/{id:guid}/approve")]
    public async Task<IActionResult> ApproveLeaveRequest(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnlyA, _) = await GetSelfContextAsync();
        if (isSelfOnlyA) return Forbid();

        var req = await _db.PersonelLeaveRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.SalonId == salonId.Value);
        if (req is null) return NotFound();
        if (req.Status != "Pending") return BadRequest(new { message = "Bu talep zaten işlenmiş." });

        req.Status      = "Approved";
        req.ProcessedAt = DateTime.UtcNow;
        req.ProcessedBy = GetCurrentUserId();

        // Auto-fill puantaj for each day in range
        var daysRange = Enumerable.Range(0, req.EndDate.DayNumber - req.StartDate.DayNumber + 1)
            .Select(d => req.StartDate.AddDays(d)).ToList();

        foreach (var date in daysRange)
        {
            var existing = await _db.StylistAttendances
                .FirstOrDefaultAsync(a => a.StylistId == req.StylistId && a.Date == date);
            if (existing is null)
            {
                _db.StylistAttendances.Add(new StylistAttendance
                {
                    SalonId   = salonId.Value,
                    StylistId = req.StylistId,
                    Date      = date,
                    Status    = "leave",
                    IsHalfDay = req.IsHalfDay,
                    Note      = req.LeaveType,
                });
            }
            else
            {
                existing.Status    = "leave";
                existing.IsHalfDay = req.IsHalfDay;
                existing.Note      = req.LeaveType;
            }
        }

        // Create formal leave record
        _db.StylistLeaves.Add(new StylistLeave
        {
            StylistId  = req.StylistId,
            SalonId    = salonId.Value,
            StartAtUtc = req.StartDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            EndAtUtc   = req.EndDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            Reason     = req.Note,
            LeaveType  = req.LeaveType,
        });

        await _db.SaveChangesAsync();
        return Ok();
    }

    // PATCH /api/Personel/leave-requests/{id}/reject (managers only — self-only users can only submit, not approve/reject)
    [HttpPatch("leave-requests/{id:guid}/reject")]
    public async Task<IActionResult> RejectLeaveRequest(Guid id, [FromBody] RejectLeaveBody req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var (isSelfOnly5, _) = await GetSelfContextAsync();
        if (isSelfOnly5) return Forbid();

        var item = await _db.PersonelLeaveRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.SalonId == salonId.Value);
        if (item is null) return NotFound();
        if (item.Status != "Pending") return BadRequest(new { message = "Bu talep zaten işlenmiş." });

        item.Status       = "Rejected";
        item.ProcessedAt  = DateTime.UtcNow;
        item.ProcessedBy  = GetCurrentUserId();
        item.RejectReason = req.Reason;

        await _db.SaveChangesAsync();
        return Ok();
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    // GET /api/Personel/summary?year=&month=
    [HttpGet("summary")]
    public async Task<IActionResult> MonthlySummary([FromQuery] int year, [FromQuery] int month)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var from = new DateOnly(year, month, 1);
        var to   = from.AddMonths(1).AddDays(-1);
        int workingDays = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1)
            .Count(d => { var dow = from.AddDays(d).DayOfWeek; return dow != DayOfWeek.Sunday; });

        var (isSelfOnly6, selfStylistId6) = await GetSelfContextAsync();

        var stylistsQ = _db.Stylists.Where(s => s.SalonId == salonId.Value && s.IsActive);
        if (isSelfOnly6 && selfStylistId6.HasValue)
            stylistsQ = stylistsQ.Where(s => s.Id == selfStylistId6.Value);

        var stylists = await stylistsQ.ToListAsync();
        var attendances = await _db.StylistAttendances
            .Where(a => a.SalonId == salonId.Value && a.Date >= from && a.Date <= to).ToListAsync();

        var result = stylists.Select(s =>
        {
            var sa = attendances.Where(a => a.StylistId == s.Id).ToList();
            return new
            {
                s.Id, s.FullName, s.PayType, s.FixedSalary, s.CommissionRate,
                Present     = sa.Count(a => a.Status == "present"),
                PresentHalf = sa.Count(a => a.Status == "present" && a.IsHalfDay),
                Absent      = sa.Count(a => a.Status == "absent"),
                Leave       = sa.Count(a => a.Status == "leave"),
                Holiday     = sa.Count(a => a.Status is "holiday" or "official"),
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
    public bool    IsHalfDay { get; set; }
    public string? CheckIn   { get; set; }
    public string? CheckOut  { get; set; }
    public string? Note      { get; set; }
}

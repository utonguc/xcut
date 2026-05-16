using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
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
public class AnnouncementsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AnnouncementsController(AppDbContext db) => _db = db;

    private Guid? GetCurrentSalonId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
               ?? User.FindFirstValue("sub");
        // SalonId is stored as a claim or we look it up — use the DB approach
        return null; // resolved via DB call below
    }

    private async Task<Guid?> GetCurrentSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
               ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        return user?.SalonId;
    }

    // GET api/Announcements/active
    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var salonId = await GetCurrentSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var now = DateTime.UtcNow;

        var candidates = await _db.Announcements
            .Where(a =>
                a.IsPublished &&
                (a.StartsAtUtc == null || a.StartsAtUtc <= now) &&
                (a.ExpiresAtUtc == null || a.ExpiresAtUtc >= now))
            .OrderByDescending(a => a.Priority)
            .ThenByDescending(a => a.CreatedAtUtc)
            .ToListAsync();

        var salonIdStr = salonId.Value.ToString();

        var active = candidates
            .Where(a => !IsExcluded(a.ExcludedSalonIds, salonIdStr))
            .Where(a => !a.IsRecurring || IsRecurrenceActive(a, now))
            .Select(a => new AnnouncementDetailResponse(
                a.Id, a.Title, a.Body, a.Type, a.Priority,
                a.IsPublished, a.StartsAtUtc, a.ExpiresAtUtc,
                a.ExcludedSalonIds, a.IsRecurring, a.RecurrenceType,
                a.RecurrenceDays, a.RecurrenceStartTime, a.RecurrenceEndTime,
                a.ReadCount, a.CreatedAtUtc, a.UpdatedAtUtc))
            .ToList();

        return Ok(active);
    }

    // POST api/Announcements/{id}/read — increment ReadCount
    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var ann = await _db.Announcements.FindAsync(id);
        if (ann is null) return NotFound();
        ann.ReadCount++;
        await _db.SaveChangesAsync();
        return Ok(new { readCount = ann.ReadCount });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool IsExcluded(string excludedSalonIds, string salonIdStr)
    {
        if (string.IsNullOrWhiteSpace(excludedSalonIds) || excludedSalonIds == "[]")
            return false;
        try
        {
            var ids = JsonSerializer.Deserialize<List<string>>(excludedSalonIds);
            return ids != null && ids.Contains(salonIdStr, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Returns true if a recurring announcement is currently active.
    /// daily   → every day, between RecurrenceStartTime and RecurrenceEndTime (UTC).
    /// weekly  → on days listed in RecurrenceDays ("0,1,2" where 0=Sun), between the time window.
    /// monthly → not time-windowed; treated as always active once started (simple implementation).
    /// </summary>
    private static bool IsRecurrenceActive(Announcement a, DateTime nowUtc)
    {
        if (a.RecurrenceType is null) return true;

        var nowTime = TimeOnly.FromDateTime(nowUtc);

        bool InTimeWindow()
        {
            if (!TimeOnly.TryParseExact(a.RecurrenceStartTime ?? "00:00", "HH:mm", out var start)) return true;
            if (!TimeOnly.TryParseExact(a.RecurrenceEndTime   ?? "23:59", "HH:mm", out var end))   return true;
            return nowTime >= start && nowTime <= end;
        }

        return a.RecurrenceType.ToLowerInvariant() switch
        {
            "daily" => InTimeWindow(),
            "weekly" => IsActiveToday(a.RecurrenceDays, (int)nowUtc.DayOfWeek) && InTimeWindow(),
            "monthly" => true, // always active on the day it starts (can be refined)
            _ => true,
        };
    }

    private static bool IsActiveToday(string? recurrenceDays, int todayDow)
    {
        if (string.IsNullOrWhiteSpace(recurrenceDays)) return true;
        return recurrenceDays.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Any(d => int.TryParse(d.Trim(), out var day) && day == todayDow);
    }
}

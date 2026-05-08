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
public class WhatsAppController : ControllerBase
{
    private readonly AppDbContext _db;

    public WhatsAppController(AppDbContext db) => _db = db;

    private Guid? GetSalonId()
    {
        var claim = User.FindFirstValue("salonId") ?? User.FindFirstValue("SalonId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var s = await _db.WhatsAppSettings.FirstOrDefaultAsync(x => x.SalonId == salonId);
        if (s is null)
            return Ok(new WhatsAppSettingsResponse { IsActive = false });

        return Ok(new WhatsAppSettingsResponse
        {
            IsActive      = s.IsActive,
            PhoneNumberId = s.PhoneNumberId,
            FromNumber    = s.FromNumber,
            HasToken      = !string.IsNullOrEmpty(s.ApiToken),
        });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateWhatsAppSettingsRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var s = await _db.WhatsAppSettings.FirstOrDefaultAsync(x => x.SalonId == salonId);
        if (s is null)
        {
            s = new WhatsAppSetting { SalonId = salonId.Value };
            _db.WhatsAppSettings.Add(s);
        }

        s.IsActive      = req.IsActive;
        s.PhoneNumberId = req.PhoneNumberId;
        s.FromNumber    = req.FromNumber;
        if (!string.IsNullOrEmpty(req.ApiToken))
            s.ApiToken = req.ApiToken;
        s.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Ayarlar kaydedildi." });
    }

    [HttpGet("logs")]
    public async Task<IActionResult> Logs([FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? status = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var q = _db.WhatsAppLogs
            .Include(l => l.Customer)
            .Where(l => l.SalonId == salonId);

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(l => l.Status == status);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(l => l.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new WhatsAppLogListItem
            {
                Id           = l.Id.ToString(),
                ToNumber     = l.ToNumber,
                MessageBody  = l.MessageBody,
                Status       = l.Status,
                CustomerName = l.Customer != null ? l.Customer.FirstName + " " + l.Customer.LastName : null,
                SentByName   = l.SentByName,
                MessageType  = l.MessageType,
                ErrorDetail  = l.ErrorDetail,
                CreatedAtUtc = l.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(new PagedResult<WhatsAppLogListItem>
        {
            Items    = items,
            Total    = total,
            Page     = page,
            PageSize = pageSize,
        });
    }
}

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GoogleCalendarController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IGoogleCalendarService _gcal;

    public GoogleCalendarController(AppDbContext db, IGoogleCalendarService gcal)
    {
        _db = db; _gcal = gcal;
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

    // GET api/GoogleCalendar/status?forSelf=false
    [HttpGet("status"), Authorize]
    public async Task<IActionResult> Status([FromQuery] bool forSelf = false)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        Guid? userId = forSelf ? GetUserId() : null;
        var s = await _gcal.GetStatusAsync(salonId.Value, userId);
        return Ok(new { s.IsConnected, s.CalendarName, s.ConnectedAt, s.ConnectedEmail, isConfigured = _gcal.IsConfigured });
    }

    // GET api/GoogleCalendar/auth-url?forSelf=false
    [HttpGet("auth-url"), Authorize]
    public async Task<IActionResult> AuthUrl([FromQuery] bool forSelf = false)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        if (!_gcal.IsConfigured)
            return BadRequest(new { message = "Google Calendar entegrasyonu henüz yapılandırılmamış." });
        Guid? userId = forSelf ? GetUserId() : null;
        return Ok(new { url = _gcal.GetCalendarConnectUrl(salonId.Value, userId) });
    }

    // GET api/GoogleCalendar/callback?code=...&state=...
    [HttpGet("callback"), AllowAnonymous]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error)
    {
        const string front = "/ayarlar";

        if (!string.IsNullOrEmpty(error))
            return Redirect($"{front}?gcal=error&reason={Uri.EscapeDataString(error)}");

        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
            return Redirect($"{front}?gcal=error&reason=missing_params");

        if (!_gcal.ValidateCalendarState(state, out var salonId, out var rawUserId))
            return Redirect($"{front}?gcal=error&reason=invalid_state");

        Guid? userId = rawUserId == Guid.Empty ? null : rawUserId;
        var (success, _) = await _gcal.ExchangeCalendarCodeAsync(salonId, userId, code);

        var successParam = userId.HasValue ? "self_connected" : "connected";
        return success
            ? Redirect($"{front}?gcal={successParam}")
            : Redirect($"{front}?gcal=error&reason=exchange_failed");
    }

    // DELETE api/GoogleCalendar/disconnect?forSelf=false
    [HttpDelete("disconnect"), Authorize]
    public async Task<IActionResult> Disconnect([FromQuery] bool forSelf = false)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        Guid? userId = forSelf ? GetUserId() : null;
        await _gcal.DisconnectAsync(salonId.Value, userId);
        return Ok(new { message = "Google Calendar bağlantısı kesildi." });
    }

    // POST api/GoogleCalendar/sync
    [HttpPost("sync"), Authorize]
    public async Task<IActionResult> Sync()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        if (!_gcal.IsConfigured)
            return BadRequest(new { message = "Entegrasyon yapılandırılmamış." });
        var count = await _gcal.SyncUpcomingAsync(salonId.Value);
        return Ok(new { synced = count, message = $"{count} randevu Google Calendar'a aktarıldı." });
    }

    // POST api/GoogleCalendar/sync-personal
    [HttpPost("sync-personal"), Authorize]
    public async Task<IActionResult> SyncPersonal()
    {
        var salonId = await GetSalonIdAsync();
        var userId  = GetUserId();
        if (salonId is null || userId is null) return Unauthorized();
        if (!_gcal.IsConfigured)
            return BadRequest(new { message = "Entegrasyon yapılandırılmamış." });

        var role      = User.FindFirstValue(System.Security.Claims.ClaimTypes.Role) ?? "";
        var isManager = role is "SalonYonetici" or "SuperAdmin" or "Kasiyer" or "Resepsiyon";

        var count = await _gcal.SyncPersonalAsync(salonId.Value, userId.Value, isManager);
        return Ok(new { synced = count, message = $"{count} randevu kişisel takviminize aktarıldı." });
    }
}

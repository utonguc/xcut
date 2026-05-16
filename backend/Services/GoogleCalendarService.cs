using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Services;

public interface IGoogleCalendarService
{
    bool IsConfigured { get; }

    // Calendar OAuth (authenticated user connecting their calendar)
    string GetCalendarConnectUrl(Guid salonId, Guid? userId);
    bool ValidateCalendarState(string state, out Guid salonId, out Guid userId);
    Task<(bool success, string? calendarName)> ExchangeCalendarCodeAsync(Guid salonId, Guid? userId, string code);

    // Google Sign-In OAuth (unauthenticated)
    string GetSignInUrl();
    bool ValidateSignInState(string state);
    Task<GoogleSignInTokens?> ExchangeSignInCodeAsync(string code);
    Task SaveUserCalendarTokenAsync(Guid salonId, Guid userId, string connectedEmail, string accessToken, string? refreshToken, int expiresIn, string? calendarName);

    // Status / disconnect
    Task<GCalStatus> GetStatusAsync(Guid salonId, Guid? userId = null);
    Task DisconnectAsync(Guid salonId, Guid? userId = null);

    // Calendar event operations (salon-level)
    Task<string?> PushEventAsync(Guid salonId, Appointment appt, string customerName, string stylistName);
    Task UpdateEventAsync(Guid salonId, string gcalEventId, Appointment appt, string customerName, string stylistName);
    Task DeleteEventAsync(Guid salonId, string gcalEventId);

    // Calendar event operations (per-stylist)
    Task<string?> PushEventForStylistAsync(Guid salonId, Guid stylistId, Appointment appt, string customerName, string stylistName);
    Task UpdateEventForStylistAsync(Guid salonId, Guid stylistId, string gcalEventId, Appointment appt, string customerName, string stylistName);
    Task DeleteEventForStylistAsync(Guid salonId, Guid stylistId, string gcalEventId);

    Task<int> SyncUpcomingAsync(Guid salonId);

    // Personal sync: manager gets all appointments, stylist gets own appointments
    Task<int> SyncPersonalAsync(Guid salonId, Guid userId, bool isManager);

    // Auto-push new appointment to all connected manager personal calendars
    Task PushEventForManagersAsync(Guid salonId, Appointment appt, string customerName, string stylistName);
}

public record GCalStatus(bool IsConnected, string? CalendarName, DateTime? ConnectedAt, string? ConnectedEmail = null);
public record GoogleSignInTokens(string Email, string? Name, string AccessToken, string? RefreshToken, int ExpiresIn, string? CalendarName);

public class GoogleCalendarService : IGoogleCalendarService
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<GoogleCalendarService> _logger;

    private string ClientId          => _config["GoogleCalendar:ClientId"]          ?? "";
    private string ClientSecret      => _config["GoogleCalendar:ClientSecret"]      ?? "";
    private string RedirectUri       => _config["GoogleCalendar:RedirectUri"]       ?? "";
    private string SignInRedirectUri => _config["GoogleCalendar:SignInRedirectUri"] ?? "";
    private string HmacKey           => _config["Jwt:Key"]                          ?? "xcut-gcal-key";

    public bool IsConfigured =>
        !string.IsNullOrEmpty(ClientId) && !string.IsNullOrEmpty(ClientSecret);

    public GoogleCalendarService(
        AppDbContext db, IHttpClientFactory http,
        IConfiguration config, ILogger<GoogleCalendarService> logger)
    {
        _db = db; _http = http; _config = config; _logger = logger;
    }

    // ── Calendar OAuth ────────────────────────────────────────────────────────

    public string GetCalendarConnectUrl(Guid salonId, Guid? userId)
    {
        var state  = MakeCalendarState(salonId, userId ?? Guid.Empty);
        var scopes = Uri.EscapeDataString("https://www.googleapis.com/auth/calendar.events");
        var redir  = Uri.EscapeDataString(RedirectUri);
        return "https://accounts.google.com/o/oauth2/v2/auth"
             + $"?client_id={ClientId}"
             + $"&redirect_uri={redir}"
             + $"&response_type=code"
             + $"&scope={scopes}"
             + $"&access_type=offline"
             + $"&prompt=consent"
             + $"&state={state}";
    }

    public bool ValidateCalendarState(string state, out Guid salonId, out Guid userId)
        => CheckCalendarState(state, out salonId, out userId);

    public async Task<(bool success, string? calendarName)> ExchangeCalendarCodeAsync(
        Guid salonId, Guid? userId, string code)
    {
        try
        {
            var client = _http.CreateClient();
            var resp = await client.PostAsync("https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["code"]          = code,
                    ["client_id"]     = ClientId,
                    ["client_secret"] = ClientSecret,
                    ["redirect_uri"]  = RedirectUri,
                    ["grant_type"]    = "authorization_code",
                }));

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("GCal token exchange failed: {S}", resp.StatusCode);
                return (false, null);
            }

            using var doc    = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root         = doc.RootElement;
            var accessToken  = root.GetProperty("access_token").GetString()!;
            var refreshToken = root.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null;
            var expiresIn    = root.TryGetProperty("expires_in",    out var ei) ? ei.GetInt32() : 3600;

            string? calendarName = null;
            try
            {
                var ic = _http.CreateClient();
                ic.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                using var cd = JsonDocument.Parse(await ic.GetStringAsync(
                    "https://www.googleapis.com/calendar/v3/calendars/primary"));
                calendarName = cd.RootElement.TryGetProperty("summary", out var s) ? s.GetString() : null;
            }
            catch { /* best effort */ }

            await UpsertTokenAsync(salonId, userId, null, accessToken, refreshToken, expiresIn, calendarName);
            return (true, calendarName);
        }
        catch (Exception ex) { _logger.LogError(ex, "GCal exchange error"); return (false, null); }
    }

    // ── Google Sign-In OAuth ──────────────────────────────────────────────────

    public string GetSignInUrl()
    {
        var state  = MakeSignInState();
        var scopes = Uri.EscapeDataString("openid email profile https://www.googleapis.com/auth/calendar.events");
        var redir  = Uri.EscapeDataString(SignInRedirectUri);
        return "https://accounts.google.com/o/oauth2/v2/auth"
             + $"?client_id={ClientId}"
             + $"&redirect_uri={redir}"
             + $"&response_type=code"
             + $"&scope={scopes}"
             + $"&access_type=offline"
             + $"&prompt=consent"
             + $"&state={state}";
    }

    public bool ValidateSignInState(string state) => CheckSignInState(state);

    public async Task<GoogleSignInTokens?> ExchangeSignInCodeAsync(string code)
    {
        try
        {
            var client = _http.CreateClient();
            var resp = await client.PostAsync("https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["code"]          = code,
                    ["client_id"]     = ClientId,
                    ["client_secret"] = ClientSecret,
                    ["redirect_uri"]  = SignInRedirectUri,
                    ["grant_type"]    = "authorization_code",
                }));

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("GCal sign-in exchange failed: {S}", resp.StatusCode);
                return null;
            }

            using var doc    = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root         = doc.RootElement;
            var accessToken  = root.GetProperty("access_token").GetString()!;
            var refreshToken = root.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null;
            var expiresIn    = root.TryGetProperty("expires_in",    out var ei) ? ei.GetInt32() : 3600;
            var idToken      = root.TryGetProperty("id_token",      out var idt) ? idt.GetString() : null;

            string? email = null;
            string? name  = null;
            if (!string.IsNullOrEmpty(idToken))
            {
                var parts = idToken.Split('.');
                if (parts.Length >= 2)
                {
                    try
                    {
                        var padded = parts[1].Replace('-', '+').Replace('_', '/');
                        padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
                        using var pd = JsonDocument.Parse(
                            Encoding.UTF8.GetString(Convert.FromBase64String(padded)));
                        email = pd.RootElement.TryGetProperty("email", out var em) ? em.GetString() : null;
                        name  = pd.RootElement.TryGetProperty("name",  out var nm) ? nm.GetString() : null;
                    }
                    catch { /* ignore */ }
                }
            }

            string? calendarName = null;
            try
            {
                var cc = _http.CreateClient();
                cc.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                using var cd = JsonDocument.Parse(await cc.GetStringAsync(
                    "https://www.googleapis.com/calendar/v3/calendars/primary"));
                calendarName = cd.RootElement.TryGetProperty("summary", out var s) ? s.GetString() : null;
            }
            catch { /* best effort */ }

            return new GoogleSignInTokens(email ?? "", name, accessToken, refreshToken, expiresIn, calendarName);
        }
        catch (Exception ex) { _logger.LogError(ex, "GCal sign-in exchange error"); return null; }
    }

    public async Task SaveUserCalendarTokenAsync(
        Guid salonId, Guid userId, string connectedEmail,
        string accessToken, string? refreshToken, int expiresIn, string? calendarName)
        => await UpsertTokenAsync(salonId, userId, connectedEmail, accessToken, refreshToken, expiresIn, calendarName);

    // ── Status / Disconnect ───────────────────────────────────────────────────

    public async Task<GCalStatus> GetStatusAsync(Guid salonId, Guid? userId = null)
    {
        var token = await _db.GoogleCalendarTokens
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.UserId == userId);
        return token == null
            ? new GCalStatus(false, null, null, null)
            : new GCalStatus(true, token.CalendarName, token.ConnectedAtUtc, token.ConnectedEmail);
    }

    public async Task DisconnectAsync(Guid salonId, Guid? userId = null)
    {
        var token = await _db.GoogleCalendarTokens
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.UserId == userId);
        if (token != null) { _db.GoogleCalendarTokens.Remove(token); await _db.SaveChangesAsync(); }
    }

    // ── Event operations (salon-level) ────────────────────────────────────────

    public async Task<string?> PushEventAsync(Guid salonId, Appointment appt, string customerName, string stylistName)
    {
        if (!IsConfigured) return null;
        var (access, calId) = await GetTokenAndCalAsync(salonId, null);
        return access == null ? null : await PushToCalendar(access, calId, appt, customerName, stylistName);
    }

    public async Task UpdateEventAsync(Guid salonId, string gcalEventId, Appointment appt, string customerName, string stylistName)
    {
        if (!IsConfigured) return;
        var (access, calId) = await GetTokenAndCalAsync(salonId, null);
        if (access != null) await PutToCalendar(access, calId, gcalEventId, appt, customerName, stylistName);
    }

    public async Task DeleteEventAsync(Guid salonId, string gcalEventId)
    {
        if (!IsConfigured) return;
        var (access, calId) = await GetTokenAndCalAsync(salonId, null);
        if (access != null) await DeleteFromCalendar(access, calId, gcalEventId);
    }

    // ── Event operations (per-stylist) ────────────────────────────────────────

    public async Task<string?> PushEventForStylistAsync(Guid salonId, Guid stylistId, Appointment appt, string customerName, string stylistName)
    {
        if (!IsConfigured) return null;
        var userId = await GetStylistUserIdAsync(salonId, stylistId);
        if (userId == null) return null;
        var (access, calId) = await GetTokenAndCalAsync(salonId, userId);
        return access == null ? null : await PushToCalendar(access, calId, appt, customerName, stylistName);
    }

    public async Task UpdateEventForStylistAsync(Guid salonId, Guid stylistId, string gcalEventId, Appointment appt, string customerName, string stylistName)
    {
        if (!IsConfigured) return;
        var userId = await GetStylistUserIdAsync(salonId, stylistId);
        if (userId == null) return;
        var (access, calId) = await GetTokenAndCalAsync(salonId, userId);
        if (access != null) await PutToCalendar(access, calId, gcalEventId, appt, customerName, stylistName);
    }

    public async Task DeleteEventForStylistAsync(Guid salonId, Guid stylistId, string gcalEventId)
    {
        if (!IsConfigured) return;
        var userId = await GetStylistUserIdAsync(salonId, stylistId);
        if (userId == null) return;
        var (access, calId) = await GetTokenAndCalAsync(salonId, userId);
        if (access != null) await DeleteFromCalendar(access, calId, gcalEventId);
    }

    // ── Bulk sync ─────────────────────────────────────────────────────────────

    public async Task<int> SyncUpcomingAsync(Guid salonId)
    {
        if (!IsConfigured) return 0;
        var (access, _) = await GetTokenAndCalAsync(salonId, null);
        if (access == null) return 0;

        var upcoming = await _db.Appointments
            .Where(x => x.SalonId == salonId
                     && x.StartAtUtc >= DateTime.UtcNow
                     && x.Status    != "Cancelled"
                     && x.GcalEventId == null)
            .Include(x => x.Customer)
            .Include(x => x.Stylist)
            .Take(50)
            .ToListAsync();

        int count = 0;
        foreach (var appt in upcoming)
        {
            var cName   = appt.Customer != null ? $"{appt.Customer.FirstName} {appt.Customer.LastName}" : "Müşteri";
            var sName   = appt.Stylist?.FullName ?? "Stilist";
            var eventId = await PushEventAsync(salonId, appt, cName, sName);
            if (eventId != null) { appt.GcalEventId = eventId; count++; }
        }
        if (count > 0) await _db.SaveChangesAsync();
        return count;
    }

    public async Task<int> SyncPersonalAsync(Guid salonId, Guid userId, bool isManager)
    {
        if (!IsConfigured) return 0;
        var (access, calId) = await GetTokenAndCalAsync(salonId, userId);
        if (access == null) return 0;

        List<Appointment> upcoming;

        if (isManager)
        {
            // Manager: sync all salon appointments
            upcoming = await _db.Appointments
                .Where(x => x.SalonId == salonId
                         && x.StartAtUtc >= DateTime.UtcNow
                         && x.Status    != "Cancelled")
                .Include(x => x.Customer)
                .Include(x => x.Stylist)
                .Take(100)
                .ToListAsync();
        }
        else
        {
            // Stylist: sync only their own appointments
            var stylistId = await _db.Stylists
                .Where(s => s.SalonId == salonId)
                .Join(_db.Users.Where(u => u.Id == userId),
                    s => s.Email, u => u.Email, (s, _) => s.Id)
                .FirstOrDefaultAsync();
            if (stylistId == Guid.Empty) return 0;

            upcoming = await _db.Appointments
                .Where(x => x.SalonId  == salonId
                         && x.StylistId == stylistId
                         && x.StartAtUtc >= DateTime.UtcNow
                         && x.Status    != "Cancelled")
                .Include(x => x.Customer)
                .Include(x => x.Stylist)
                .Take(100)
                .ToListAsync();
        }

        int count = 0;
        foreach (var appt in upcoming)
        {
            var cName = appt.Customer != null ? $"{appt.Customer.FirstName} {appt.Customer.LastName}" : "Müşteri";
            var sName = appt.Stylist?.FullName ?? "Stilist";
            var eventId = await PushToCalendar(access, calId, appt, cName, sName);
            if (eventId != null) count++;
        }
        return count;
    }

    public async Task PushEventForManagersAsync(Guid salonId, Appointment appt, string customerName, string stylistName)
    {
        if (!IsConfigured) return;

        // Find all personal calendar tokens for this salon
        var tokens = await _db.GoogleCalendarTokens
            .Where(t => t.SalonId == salonId && t.UserId != null)
            .Select(t => t.UserId!.Value)
            .ToListAsync();

        if (tokens.Count == 0) return;

        // Only push to non-stylist users (stylists handled by PushEventForStylistAsync)
        var stylistUserIds = await _db.Stylists
            .Where(s => s.SalonId == salonId && s.Email != null)
            .Join(_db.Users.Where(u => u.SalonId == salonId),
                s => s.Email, u => u.Email, (_, u) => u.Id)
            .ToListAsync();

        foreach (var userId in tokens.Except(stylistUserIds))
        {
            var (access, calId) = await GetTokenAndCalAsync(salonId, userId);
            if (access != null)
                await PushToCalendar(access, calId, appt, customerName, stylistName);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task<Guid?> GetStylistUserIdAsync(Guid salonId, Guid stylistId)
    {
        var email = await _db.Stylists
            .Where(x => x.Id == stylistId && x.SalonId == salonId)
            .Select(x => x.Email)
            .FirstOrDefaultAsync();
        if (string.IsNullOrWhiteSpace(email)) return null;
        return await _db.Users
            .Where(x => x.SalonId == salonId && x.Email == email && x.IsActive)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync();
    }

    private async Task UpsertTokenAsync(
        Guid salonId, Guid? userId, string? connectedEmail,
        string accessToken, string? refreshToken, int expiresIn, string? calendarName)
    {
        var existing = await _db.GoogleCalendarTokens
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.UserId == userId);
        if (existing != null)
        {
            existing.AccessToken  = accessToken;
            if (!string.IsNullOrEmpty(refreshToken)) existing.RefreshToken = refreshToken;
            existing.ExpiresAtUtc = DateTime.UtcNow.AddSeconds(expiresIn - 60);
            existing.CalendarName = calendarName;
            if (!string.IsNullOrEmpty(connectedEmail)) existing.ConnectedEmail = connectedEmail;
        }
        else
        {
            _db.GoogleCalendarTokens.Add(new GoogleCalendarToken
            {
                SalonId        = salonId,
                UserId         = userId,
                ConnectedEmail = connectedEmail,
                AccessToken    = accessToken,
                RefreshToken   = refreshToken,
                ExpiresAtUtc   = DateTime.UtcNow.AddSeconds(expiresIn - 60),
                CalendarName   = calendarName,
            });
        }
        await _db.SaveChangesAsync();
    }

    private async Task<(string? token, string calId)> GetTokenAndCalAsync(Guid salonId, Guid? userId)
    {
        var row = await _db.GoogleCalendarTokens
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.UserId == userId);
        if (row == null) return (null, "primary");

        if (DateTime.UtcNow >= row.ExpiresAtUtc && !string.IsNullOrEmpty(row.RefreshToken))
        {
            try
            {
                var client = _http.CreateClient();
                var resp = await client.PostAsync("https://oauth2.googleapis.com/token",
                    new FormUrlEncodedContent(new Dictionary<string, string>
                    {
                        ["refresh_token"] = row.RefreshToken,
                        ["client_id"]     = ClientId,
                        ["client_secret"] = ClientSecret,
                        ["grant_type"]    = "refresh_token",
                    }));
                if (resp.IsSuccessStatusCode)
                {
                    using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                    var r = doc.RootElement;
                    row.AccessToken  = r.GetProperty("access_token").GetString()!;
                    row.ExpiresAtUtc = DateTime.UtcNow.AddSeconds(
                        r.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() - 60 : 3540);
                    await _db.SaveChangesAsync();
                }
                else { _logger.LogWarning("GCal token refresh failed"); return (null, "primary"); }
            }
            catch (Exception ex) { _logger.LogError(ex, "GCal refresh error"); return (null, "primary"); }
        }

        return (row.AccessToken, Uri.EscapeDataString(row.CalendarId));
    }

    private async Task<string?> PushToCalendar(string access, string calId, Appointment appt, string cName, string sName)
    {
        try
        {
            var client = _http.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", access);
            var resp = await client.PostAsync(
                $"https://www.googleapis.com/calendar/v3/calendars/{calId}/events",
                MakeJsonContent(BuildEventBody(appt, cName, sName)));
            if (!resp.IsSuccessStatusCode) { _logger.LogWarning("GCal create failed: {S}", resp.StatusCode); return null; }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            return doc.RootElement.TryGetProperty("id", out var id) ? id.GetString() : null;
        }
        catch (Exception ex) { _logger.LogError(ex, "GCal PushEvent error"); return null; }
    }

    private async Task PutToCalendar(string access, string calId, string eventId, Appointment appt, string cName, string sName)
    {
        try
        {
            var client = _http.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", access);
            await client.PutAsync(
                $"https://www.googleapis.com/calendar/v3/calendars/{calId}/events/{eventId}",
                MakeJsonContent(BuildEventBody(appt, cName, sName)));
        }
        catch (Exception ex) { _logger.LogError(ex, "GCal UpdateEvent error"); }
    }

    private async Task DeleteFromCalendar(string access, string calId, string eventId)
    {
        try
        {
            var client = _http.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", access);
            await client.DeleteAsync(
                $"https://www.googleapis.com/calendar/v3/calendars/{calId}/events/{eventId}");
        }
        catch (Exception ex) { _logger.LogError(ex, "GCal DeleteEvent error"); }
    }

    private static object BuildEventBody(Appointment appt, string customerName, string stylistName) => new
    {
        summary     = $"{customerName} — {appt.ServiceName}",
        description = $"Stilist: {stylistName}\nHizmet: {appt.ServiceName}"
                    + (string.IsNullOrEmpty(appt.Notes) ? "" : $"\nNot: {appt.Notes}"),
        start       = new { dateTime = appt.StartAtUtc.ToString("o"), timeZone = "UTC" },
        end         = new { dateTime = appt.EndAtUtc.ToString("o"),   timeZone = "UTC" },
    };

    private static StringContent MakeJsonContent(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    // ── State encoding ────────────────────────────────────────────────────────

    private string MakeCalendarState(Guid salonId, Guid userId)
    {
        var data = $"cal:{salonId:N}:{userId:N}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(HmacKey));
        var sig = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(data)))[..16].ToLower();
        return Convert.ToBase64String(Encoding.UTF8.GetBytes($"{data}:{sig}"))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private bool CheckCalendarState(string state, out Guid salonId, out Guid userId)
    {
        salonId = Guid.Empty;
        userId  = Guid.Empty;
        try
        {
            var padded = state.Replace('-', '+').Replace('_', '/');
            padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(padded));
            var parts   = decoded.Split(':');
            if (parts.Length != 4 || parts[0] != "cal") return false;
            if (!Guid.TryParse(parts[1], out salonId)) return false;
            if (!Guid.TryParse(parts[2], out userId))  return false;
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(HmacKey));
            var expected = Convert.ToHexString(hmac.ComputeHash(
                Encoding.UTF8.GetBytes($"cal:{parts[1]}:{parts[2]}")))[..16].ToLower();
            return parts[3] == expected;
        }
        catch { return false; }
    }

    private string MakeSignInState()
    {
        var nonce = new byte[16];
        RandomNumberGenerator.Fill(nonce);
        var nonceHex = Convert.ToHexString(nonce).ToLower();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(HmacKey));
        var sig = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(nonceHex)))[..16].ToLower();
        return Convert.ToBase64String(Encoding.UTF8.GetBytes($"sgn:{nonceHex}:{sig}"))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private bool CheckSignInState(string state)
    {
        try
        {
            var padded = state.Replace('-', '+').Replace('_', '/');
            padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(padded));
            var parts   = decoded.Split(':');
            if (parts.Length != 3 || parts[0] != "sgn") return false;
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(HmacKey));
            var expected = Convert.ToHexString(hmac.ComputeHash(
                Encoding.UTF8.GetBytes(parts[1])))[..16].ToLower();
            return parts[2] == expected;
        }
        catch { return false; }
    }
}

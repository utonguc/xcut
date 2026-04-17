using System.Text;
using System.Text.Json;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Services;

public interface IWhatsAppService
{
    Task<(bool ok, string? error)> SendTextAsync(
        Guid salonId, string toNumber, string body,
        Guid? customerId = null, string? sentByName = null,
        Guid? appointmentId = null, string? messageType = null);
}

public class WhatsAppService : IWhatsAppService
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<WhatsAppService> _log;

    public WhatsAppService(AppDbContext db, IHttpClientFactory http, ILogger<WhatsAppService> log)
    {
        _db   = db;
        _http = http;
        _log  = log;
    }

    public async Task<(bool ok, string? error)> SendTextAsync(
        Guid salonId, string toNumber, string body,
        Guid? customerId = null, string? sentByName = null,
        Guid? appointmentId = null, string? messageType = null)
    {
        var settings = await _db.WhatsAppSettings
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.IsActive);

        string status = "pending";
        string? errorDetail = null;

        if (settings is null || string.IsNullOrWhiteSpace(settings.ApiToken)
            || string.IsNullOrWhiteSpace(settings.PhoneNumberId))
        {
            _log.LogInformation("[WA MOCK] To:{To} Body:{Body}", toNumber, body);
            status = "sent";
        }
        else
        {
            try
            {
                var payload = new
                {
                    messaging_product = "whatsapp",
                    to                = toNumber.Replace("+", "").Replace(" ", ""),
                    type              = "text",
                    text              = new { preview_url = false, body }
                };

                var json    = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var client = _http.CreateClient();
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {settings.ApiToken}");

                var url = $"https://graph.facebook.com/v18.0/{settings.PhoneNumberId}/messages";
                var res = await client.PostAsync(url, content);

                if (res.IsSuccessStatusCode)
                {
                    status = "sent";
                }
                else
                {
                    var errBody = await res.Content.ReadAsStringAsync();
                    errorDetail = $"HTTP {(int)res.StatusCode}: {errBody[..Math.Min(300, errBody.Length)]}";
                    status = "failed";
                    _log.LogWarning("[WA] Send failed: {Err}", errorDetail);
                }
            }
            catch (Exception ex)
            {
                errorDetail = ex.Message;
                status = "failed";
                _log.LogError(ex, "[WA] Exception while sending.");
            }
        }

        _db.WhatsAppLogs.Add(new WhatsAppLog
        {
            SalonId       = salonId,
            ToNumber      = toNumber,
            MessageBody   = body,
            Status        = status,
            ErrorDetail   = errorDetail,
            CustomerId    = customerId,
            SentByName    = sentByName,
            AppointmentId = appointmentId,
            MessageType   = messageType ?? "custom",
        });
        await _db.SaveChangesAsync();

        return (status == "sent", errorDetail);
    }
}

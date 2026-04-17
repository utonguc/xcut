using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Services;

/// <summary>
/// Her 30 dakikada bir çalışır.
/// Randevusu 23-25 saat içinde olan müşterilere WhatsApp + email hatırlatma gönderir.
/// </summary>
public class AppointmentReminderWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AppointmentReminderWorker> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(30);

    public AppointmentReminderWorker(IServiceScopeFactory scopeFactory, ILogger<AppointmentReminderWorker> log)
    {
        _scopeFactory = scopeFactory;
        _log          = log;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _log.LogInformation("AppointmentReminderWorker started.");
        await Task.Delay(TimeSpan.FromSeconds(60), ct).ConfigureAwait(false);

        while (!ct.IsCancellationRequested)
        {
            try   { await SendRemindersAsync(ct); }
            catch (Exception ex) { _log.LogError(ex, "AppointmentReminderWorker error."); }
            await Task.Delay(Interval, ct).ConfigureAwait(false);
        }
    }

    private async Task SendRemindersAsync(CancellationToken ct)
    {
        using var scope  = _scopeFactory.CreateScope();
        var db           = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var whatsapp     = scope.ServiceProvider.GetRequiredService<IWhatsAppService>();
        var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var windowStart = DateTime.UtcNow.AddHours(23);
        var windowEnd   = DateTime.UtcNow.AddHours(25);

        var upcoming = await db.Appointments
            .Include(a => a.Customer)
            .Include(a => a.Stylist)
            .Where(a => a.Status == "Scheduled"
                     && a.StartAtUtc >= windowStart
                     && a.StartAtUtc <= windowEnd)
            .ToListAsync(ct);

        foreach (var appt in upcoming)
        {
            var customer = appt.Customer;
            if (customer is null) continue;

            var alreadySent = await db.WhatsAppLogs.AnyAsync(
                l => l.SalonId == appt.SalonId
                  && l.CustomerId == customer.Id
                  && l.CreatedAtUtc >= DateTime.UtcNow.AddHours(-24)
                  && l.MessageBody.Contains("randevu hatırlatma"),
                ct);

            if (alreadySent) continue;

            var stylistName = appt.Stylist?.FullName ?? "stilistiniz";
            var time        = appt.StartAtUtc.ToString("dd.MM.yyyy HH:mm");
            var msg         = $"Merhaba {customer.FirstName}, yarın saat {time} için {stylistName} ile randevu hatırlatma: {appt.ServiceName}. İptal için bize ulaşın.";

            if (!string.IsNullOrWhiteSpace(customer.Phone))
            {
                try
                {
                    await whatsapp.SendAsync(appt.SalonId, customer.Phone, msg, customer.Id);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "WhatsApp reminder failed for appointment {Id}.", appt.Id);
                }
            }

            if (!string.IsNullOrWhiteSpace(customer.Email))
            {
                try
                {
                    await emailService.SendAsync(customer.Email, "Randevu Hatırlatma – xCut", msg);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Email reminder failed for appointment {Id}.", appt.Id);
                }
            }
        }
    }
}

using System.Globalization;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Services;

/// <summary>
/// 15 dakikada bir çalışır.
/// • 24h hatırlatma  : randevu 23-25 saat öncesi müşteriye HTML mail + WhatsApp
/// • 1h  hatırlatma  : randevu 50-80 dk öncesi müşteriye acil HTML mail
/// • Sabah özeti     : TR saatiyle 08:00-08:15 arası salon yöneticilerine günlük program
/// </summary>
public class AppointmentReminderWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AppointmentReminderWorker> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);
    private static readonly CultureInfo TrCulture = new("tr-TR");

    // In-memory dedup: sabah özeti bugün gönderildi mi?
    private readonly HashSet<(Guid salonId, DateOnly date)> _digestSent = new();

    public AppointmentReminderWorker(IServiceScopeFactory scopeFactory, ILogger<AppointmentReminderWorker> log)
    {
        _scopeFactory = scopeFactory;
        _log          = log;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _log.LogInformation("AppointmentReminderWorker started.");
        await Task.Delay(TimeSpan.FromSeconds(60), ct);

        while (!ct.IsCancellationRequested)
        {
            try   { await RunAsync(ct); }
            catch (Exception ex) { _log.LogError(ex, "AppointmentReminderWorker error."); }
            await Task.Delay(Interval, ct);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    private async Task RunAsync(CancellationToken ct)
    {
        await AutoCloseStaleAppointmentsAsync(ct);
        await SendReminderEmailsAsync(ct);
        await MaybeSendDailyDigestAsync(ct);
    }

    // InProgress + 3h geçti → Completed | Scheduled + 2h geçti → Late
    private async Task AutoCloseStaleAppointmentsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        var stale = await db.Appointments
            .Where(a =>
                (a.Status == "InProgress" && a.EndAtUtc < now.AddHours(-3)) ||
                (a.Status == "Scheduled"  && a.StartAtUtc < now.AddHours(-2)))
            .ToListAsync(ct);

        if (stale.Count == 0) return;

        foreach (var a in stale)
        {
            a.Status       = a.Status == "InProgress" ? "Completed" : "Late";
            a.UpdatedAtUtc = now;
        }

        await db.SaveChangesAsync(ct);
        _log.LogInformation("Auto-closed {Count} stale appointments.", stale.Count);
    }

    // ── Müşteri hatırlatmaları ────────────────────────────────────────────────
    private async Task SendReminderEmailsAsync(CancellationToken ct)
    {
        using var scope  = _scopeFactory.CreateScope();
        var db           = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var whatsapp     = scope.ServiceProvider.GetRequiredService<IWhatsAppService>();

        var now = DateTime.UtcNow;

        // 24h penceresi: 23-25 saat sonrası
        var win24Start = now.AddHours(23);
        var win24End   = now.AddHours(25);
        // 1h penceresi: 50-80 dakika sonrası
        var win1Start  = now.AddMinutes(50);
        var win1End    = now.AddMinutes(80);

        var upcoming = await db.Appointments
            .Include(a => a.Customer)
            .Include(a => a.Stylist)
            .Include(a => a.Service)
            .Where(a => a.Status == "Scheduled" && (
                (a.StartAtUtc >= win24Start && a.StartAtUtc <= win24End && a.Reminder24hSentAt == null) ||
                (a.StartAtUtc >= win1Start  && a.StartAtUtc <= win1End  && a.Reminder1hSentAt  == null)
            ))
            .ToListAsync(ct);

        if (upcoming.Count == 0) return;

        var salonIds = upcoming.Select(a => a.SalonId).Distinct().ToList();

        var websites = await db.SalonWebsites
            .Where(w => salonIds.Contains(w.SalonId) && w.IsPublished)
            .ToDictionaryAsync(w => w.SalonId, ct);

        var salons = await db.Salons
            .Where(s => salonIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, ct);

        bool anyUpdated = false;

        foreach (var appt in upcoming)
        {
            var customer = appt.Customer;
            if (customer is null) continue;

            websites.TryGetValue(appt.SalonId, out var website);
            salons.TryGetValue(appt.SalonId, out var salon);

            var salonName   = salon?.Name ?? "Salon";
            var stylistName = appt.Stylist?.FullName ?? "Stilistiniz";
            var specialty   = appt.Stylist?.Specialty;
            var serviceName = appt.ServiceName;
            var durationMin = (int)(appt.EndAtUtc - appt.StartAtUtc).TotalMinutes;
            var trTime      = appt.StartAtUtc.AddHours(3);
            var fmtDate     = trTime.ToString("dd MMMM yyyy, dddd", TrCulture);
            var fmtTime     = trTime.ToString("HH:mm", TrCulture);
            decimal? price  = appt.Service?.Price;
            var address     = website?.Address;
            var mapsUrl     = website?.GoogleMapsUrl;
            var siteUrl     = website?.Slug is { Length: > 0 } slug
                                  ? $"https://xcut.xshield.com.tr/site/{slug}"
                                  : null;
            var salonPhone  = website?.Phone;
            var salonEmail  = website?.Email;

            bool is24h = appt.StartAtUtc >= win24Start && appt.StartAtUtc <= win24End && appt.Reminder24hSentAt == null;
            bool is1h  = appt.StartAtUtc >= win1Start  && appt.StartAtUtc <= win1End  && appt.Reminder1hSentAt  == null;

            // ── 24 saat hatırlatma ─────────────────────────────────────────────
            if (is24h)
            {
                if (!string.IsNullOrWhiteSpace(customer.Phone))
                {
                    try
                    {
                        var waMsg = $"Merhaba {customer.FirstName}, yarın saat {fmtTime} için {stylistName} ile randevunuz var: {serviceName}. " +
                                    (address is not null ? $"Adres: {address}. " : "") +
                                    "İptal için lütfen önceden haber verin.";
                        await whatsapp.SendTextAsync(appt.SalonId, customer.Phone, waMsg, customer.Id);
                    }
                    catch (Exception ex) { _log.LogWarning(ex, "WhatsApp 24h reminder failed for {Id}.", appt.Id); }
                }

                if (!string.IsNullOrWhiteSpace(customer.Email))
                {
                    try
                    {
                        var html = Build24hEmail(
                            customer.FirstName, salonName, stylistName, specialty,
                            serviceName, fmtDate, fmtTime, durationMin, price,
                            address, mapsUrl, siteUrl, salonPhone, salonEmail);
                        await emailService.SendAsync(customer.Email, $"Yarınki Randevunuz – {salonName}", html);
                        appt.Reminder24hSentAt = now;
                        anyUpdated = true;
                        _log.LogInformation("24h reminder sent to {Email} for appt {Id}.", customer.Email, appt.Id);
                    }
                    catch (Exception ex) { _log.LogWarning(ex, "Email 24h reminder failed for {Id}.", appt.Id); }
                }
            }

            // ── 1 saat hatırlatma ──────────────────────────────────────────────
            if (is1h)
            {
                if (!string.IsNullOrWhiteSpace(customer.Email))
                {
                    try
                    {
                        var html = Build1hEmail(
                            customer.FirstName, salonName, stylistName,
                            serviceName, fmtDate, fmtTime, durationMin,
                            address, mapsUrl, salonPhone);
                        await emailService.SendAsync(customer.Email, $"Randevunuz 1 Saat Sonra – {salonName}", html);
                        appt.Reminder1hSentAt = now;
                        anyUpdated = true;
                        _log.LogInformation("1h reminder sent to {Email} for appt {Id}.", customer.Email, appt.Id);
                    }
                    catch (Exception ex) { _log.LogWarning(ex, "Email 1h reminder failed for {Id}.", appt.Id); }
                }
            }
        }

        if (anyUpdated) await db.SaveChangesAsync(ct);
    }

    // ── Sabah günlük özet ─────────────────────────────────────────────────────
    private async Task MaybeSendDailyDigestAsync(CancellationToken ct)
    {
        var trNow  = DateTime.UtcNow.AddHours(3);
        if (trNow.Hour != 8 || trNow.Minute >= 15) return;

        var today = DateOnly.FromDateTime(trNow);

        using var scope  = _scopeFactory.CreateScope();
        var db           = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var salons = await db.Salons.Where(s => s.IsActive).ToListAsync(ct);

        foreach (var salon in salons)
        {
            if (_digestSent.Contains((salon.Id, today))) continue;

            var managers = await db.Users
                .Include(u => u.Role)
                .Where(u => u.SalonId == salon.Id && u.IsActive
                         && (u.Role!.Name == "SalonYonetici" || u.Role.Name == "SuperAdmin")
                         && !string.IsNullOrEmpty(u.Email))
                .ToListAsync(ct);

            if (managers.Count == 0) continue;

            var dayStartUtc = new DateTime(trNow.Year, trNow.Month, trNow.Day, 0, 0, 0, DateTimeKind.Utc).AddHours(-3);
            var dayEndUtc   = dayStartUtc.AddDays(1);

            var appts = await db.Appointments
                .Include(a => a.Customer)
                .Include(a => a.Stylist)
                .Include(a => a.Service)
                .Where(a => a.SalonId == salon.Id
                         && a.Status == "Scheduled"
                         && a.StartAtUtc >= dayStartUtc
                         && a.StartAtUtc < dayEndUtc)
                .OrderBy(a => a.StartAtUtc)
                .ToListAsync(ct);

            if (appts.Count == 0) continue;

            var html = BuildDailyDigestEmail(salon.Name, today, appts);
            var subject = $"Günlük Program – {today.ToString("dd MMMM yyyy", TrCulture)}";

            foreach (var mgr in managers)
            {
                try
                {
                    await emailService.SendAsync(mgr.Email!, subject, html);
                    _log.LogInformation("Daily digest sent to {Email} ({Salon}).", mgr.Email, salon.Name);
                }
                catch (Exception ex) { _log.LogWarning(ex, "Daily digest failed for {Email}.", mgr.Email); }
            }

            _digestSent.Add((salon.Id, today));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTML TEMPLATE — 24 SAAT HATIRLATMA
    // ─────────────────────────────────────────────────────────────────────────
    private static string Build24hEmail(
        string firstName, string salonName, string stylistName, string? specialty,
        string serviceName, string fmtDate, string fmtTime, int durationMin, decimal? price,
        string? address, string? mapsUrl, string? siteUrl, string? phone, string? email)
    {
        var priceHtml    = price.HasValue
            ? $"<tr><td style='padding:6px 0;color:#64748b;font-size:13px;'>&#128176; Tahmini Ücret</td><td style='padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;'>{price.Value:N0} &#8378;</td></tr>"
            : "";
        var specialtyHtml = !string.IsNullOrWhiteSpace(specialty)
            ? $" <span style='background:#ede9fe;color:#7c3aed;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;'>{H(specialty)}</span>"
            : "";
        var addressSection = BuildAddressSection(address, mapsUrl, siteUrl);
        var contactSection = BuildContactSection(phone, email);

        return $$"""
            <!DOCTYPE html>
            <html lang="tr">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>Randevu Hatırlatma</title>
            </head>
            <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

                    <!-- HEADER -->
                    <tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:32px 36px;">
                      <div style="font-size:13px;color:rgba(255,255,255,.75);font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Randevu Hatırlatma</div>
                      <div style="font-size:26px;font-weight:900;color:#fff;margin-top:6px;line-height:1.2;">Yarınki randevunuzu<br>unutmayın! &#128197;</div>
                      <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:8px;">{{H(salonName)}}</div>
                    </td></tr>

                    <!-- GREETING -->
                    <tr><td style="padding:28px 36px 0;">
                      <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">Merhaba {{H(firstName)}},</p>
                      <p style="margin:8px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
                        Yarın için randevunuz onaylanmış durumda. Tüm detaylar aşağıda yer almaktadır.
                      </p>
                    </td></tr>

                    <!-- APPOINTMENT CARD -->
                    <tr><td style="padding:20px 36px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:20px;">
                        <tr><td>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">&#128197; Tarih</td>
                                <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;">{{H(fmtDate)}}</td></tr>
                            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">&#128336; Saat</td>
                                <td style="padding:6px 0;font-size:24px;font-weight:900;color:#7c3aed;">{{H(fmtTime)}}</td></tr>
                            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">&#9986;&#65039; Hizmet</td>
                                <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;">{{H(serviceName)}}</td></tr>
                            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">&#9201; Süre</td>
                                <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;">{{durationMin}} dakika</td></tr>
                            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">&#128100; Uzman</td>
                                <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;">{{H(stylistName)}}{{specialtyHtml}}</td></tr>
                            {{priceHtml}}
                          </table>
                        </td></tr>
                      </table>
                    </td></tr>

                    {{addressSection}}
                    {{contactSection}}

                    <!-- CANCEL NOTE -->
                    <tr><td style="padding:0 36px 28px;">
                      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;">
                        <div style="font-size:12px;color:#92400e;font-weight:700;">&#9888;&#65039; İptal / Değişiklik</div>
                        <div style="font-size:12px;color:#b45309;margin-top:4px;line-height:1.5;">
                          Randevunuzu iptal etmek veya değiştirmek isterseniz lütfen <strong>en az 2 saat öncesinden</strong> salonumuzu bilgilendirin.
                        </div>
                      </div>
                    </td></tr>

                    <!-- FOOTER -->
                    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;text-align:center;">
                      <div style="font-size:11px;color:#94a3b8;">
                        Bu mail <strong>{{H(salonName)}}</strong> tarafından otomatik gönderilmiştir. &bull; Powered by xCut
                      </div>
                    </td></tr>

                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTML TEMPLATE — 1 SAAT HATIRLATMA
    // ─────────────────────────────────────────────────────────────────────────
    private static string Build1hEmail(
        string firstName, string salonName, string stylistName,
        string serviceName, string fmtDate, string fmtTime, int durationMin,
        string? address, string? mapsUrl, string? phone)
    {
        var mapBtn = (mapsUrl is { Length: > 0 })
            ? $"""<tr><td style="padding:20px 36px 0;"><a href="{H(mapsUrl)}" style="display:block;text-align:center;background:#0ea5e9;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;">&#128205; Haritada Aç &rarr;</a></td></tr>"""
            : "";
        var addrLine = !string.IsNullOrWhiteSpace(address)
            ? $"<div style='font-size:13px;color:#475569;margin-top:6px;'>&#128205; {H(address)}</div>"
            : "";
        var phoneLine = !string.IsNullOrWhiteSpace(phone)
            ? $"<div style='font-size:13px;color:#475569;margin-top:4px;'>&#128222; {H(phone)}</div>"
            : "";

        return $$"""
            <!DOCTYPE html>
            <html lang="tr">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>Randevunuz Yaklaşıyor</title>
            </head>
            <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

                    <!-- HEADER — urgent orange -->
                    <tr><td style="background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);padding:32px 36px;">
                      <div style="font-size:13px;color:rgba(255,255,255,.75);font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Yaklaşan Randevu</div>
                      <div style="font-size:26px;font-weight:900;color:#fff;margin-top:6px;line-height:1.2;">1 Saat Sonra! &#9201;</div>
                      <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:8px;">{{H(salonName)}}</div>
                    </td></tr>

                    <!-- BODY -->
                    <tr><td style="padding:28px 36px 0;">
                      <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">Merhaba {{H(firstName)}},</p>
                      <p style="margin:8px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
                        Randevunuz yaklaşıyor! Yola çıkmayı unutmayın.
                      </p>
                    </td></tr>

                    <!-- QUICK INFO -->
                    <tr><td style="padding:20px 36px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:2px solid #fed7aa;border-radius:14px;padding:20px;">
                        <tr><td>
                          <div style="font-size:36px;font-weight:900;color:#ea580c;text-align:center;letter-spacing:2px;">{{H(fmtTime)}}</div>
                          <div style="font-size:13px;color:#92400e;text-align:center;margin-top:4px;">{{H(fmtDate)}}</div>
                          <hr style="border:none;border-top:1px solid #fed7aa;margin:14px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">&#9986;&#65039; Hizmet</td>
                                <td style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">{{H(serviceName)}}</td></tr>
                            <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">&#128100; Uzman</td>
                                <td style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">{{H(stylistName)}}</td></tr>
                            <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">&#9201; Süre</td>
                                <td style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">{{durationMin}} dakika</td></tr>
                          </table>
                          {{addrLine}}
                          {{phoneLine}}
                        </td></tr>
                      </table>
                    </td></tr>

                    {{mapBtn}}

                    <!-- FOOTER -->
                    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;margin-top:28px;text-align:center;">
                      <div style="font-size:11px;color:#94a3b8;">
                        Bu mail <strong>{{H(salonName)}}</strong> tarafından otomatik gönderilmiştir. &bull; Powered by xCut
                      </div>
                    </td></tr>

                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTML TEMPLATE — SABAH GÜNLÜK ÖZET
    // ─────────────────────────────────────────────────────────────────────────
    private static string BuildDailyDigestEmail(string salonName, DateOnly today, List<Appointment> appts)
    {
        var totalRevenue = appts.Sum(a => a.Service?.Price ?? 0);
        var byStylist    = appts.GroupBy(a => a.Stylist?.FullName ?? "Atanmamış")
                                .OrderBy(g => g.Key)
                                .ToList();

        var stylistRows = new System.Text.StringBuilder();
        foreach (var group in byStylist)
        {
            stylistRows.Append($$"""
                <tr>
                  <td colspan="4" style="padding:14px 0 6px;font-size:13px;font-weight:800;color:#7c3aed;border-bottom:1px solid #e2e8f0;">
                    &#128100; {{H(group.Key)}} <span style="font-weight:500;color:#94a3b8;font-size:12px;">({{group.Count()}} randevu)</span>
                  </td>
                </tr>
                """);

            foreach (var a in group.OrderBy(x => x.StartAtUtc))
            {
                var trTime = a.StartAtUtc.AddHours(3);
                var startFmt = trTime.ToString("HH:mm", TrCulture);
                var endFmt   = a.EndAtUtc.AddHours(3).ToString("HH:mm", TrCulture);
                var customer = a.Customer is not null
                    ? H($"{a.Customer.FirstName} {a.Customer.LastName}")
                    : "<span style='color:#94a3b8;'>—</span>";
                var priceCell = a.Service?.Price is { } p
                    ? $"{p:N0} ₺"
                    : "<span style='color:#cbd5e1;'>—</span>";

                stylistRows.Append($$"""
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:8px 8px 8px 12px;font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">{{startFmt}}–{{endFmt}}</td>
                      <td style="padding:8px;font-size:13px;color:#0f172a;">{{customer}}</td>
                      <td style="padding:8px;font-size:13px;color:#475569;">{{H(a.ServiceName)}}</td>
                      <td style="padding:8px 12px 8px 8px;font-size:13px;font-weight:700;color:#059669;text-align:right;">{{priceCell}}</td>
                    </tr>
                    """);
            }
        }

        var revenueRow = totalRevenue > 0
            ? $"""<span style="background:#dcfce7;color:#16a34a;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">Tahmini Gelir: {totalRevenue:N0} ₺</span>"""
            : "";

        return $$"""
            <!DOCTYPE html>
            <html lang="tr">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>Günlük Program</title>
            </head>
            <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
                <tr><td align="center">
                  <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

                    <!-- HEADER -->
                    <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 36px;">
                      <div style="font-size:13px;color:rgba(255,255,255,.6);font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Günlük Program</div>
                      <div style="font-size:24px;font-weight:900;color:#fff;margin-top:6px;">{{today.ToString("dd MMMM yyyy, dddd", TrCulture)}} &#9728;&#65039;</div>
                      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">{{H(salonName)}}</div>
                    </td></tr>

                    <!-- SUMMARY BADGES -->
                    <tr><td style="padding:20px 36px 0;">
                      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <span style="background:#ede9fe;color:#7c3aed;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">{{appts.Count}} Randevu</span>
                        <span style="background:#e0f2fe;color:#0369a1;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">{{byStylist.Count}} Uzman</span>
                        {{revenueRow}}
                      </div>
                    </td></tr>

                    <!-- APPOINTMENTS TABLE -->
                    <tr><td style="padding:20px 36px 28px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                        <thead>
                          <tr style="background:#f8fafc;">
                            <th style="padding:10px 8px 10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">Saat</th>
                            <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:.5px;">Müşteri</th>
                            <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:.5px;">Hizmet</th>
                            <th style="padding:10px 12px 10px 8px;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:.5px;">Ücret</th>
                          </tr>
                        </thead>
                        <tbody>
                          {{stylistRows}}
                        </tbody>
                      </table>
                    </td></tr>

                    <!-- FOOTER -->
                    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;text-align:center;">
                      <div style="font-size:11px;color:#94a3b8;">
                        Bu özet <strong>{{H(salonName)}}</strong> yöneticilerine her sabah 08:00'de gönderilir. &bull; Powered by xCut
                      </div>
                    </td></tr>

                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }

    // ── Yardımcı metodlar ─────────────────────────────────────────────────────
    private static string BuildAddressSection(string? address, string? mapsUrl, string? siteUrl)
    {
        if (string.IsNullOrWhiteSpace(address) && mapsUrl is null && siteUrl is null)
            return "";

        var rows = new System.Text.StringBuilder();
        rows.Append("<tr><td style='padding:0 36px 20px;'><table width='100%' cellpadding='0' cellspacing='0' style='background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:14px;padding:18px;'><tr><td>");
        rows.Append("<div style='font-size:12px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;'>&#128205; Salon Konumu</div>");

        if (!string.IsNullOrWhiteSpace(address))
            rows.Append($"<div style='font-size:13px;color:#0f172a;font-weight:600;margin-bottom:8px;'>{H(address)}</div>");

        if (mapsUrl is { Length: > 0 })
            rows.Append($"<a href='{H(mapsUrl)}' style='display:inline-block;background:#0ea5e9;color:#fff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;margin-right:8px;'>&#128205; Google Maps'te Aç</a>");

        if (siteUrl is { Length: > 0 })
            rows.Append($"<a href='{H(siteUrl)}' style='display:inline-block;background:#7c3aed;color:#fff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;'>&#127760; Salon Sayfası</a>");

        rows.Append("</td></tr></table></td></tr>");
        return rows.ToString();
    }

    private static string BuildContactSection(string? phone, string? email)
    {
        if (string.IsNullOrWhiteSpace(phone) && string.IsNullOrWhiteSpace(email))
            return "";

        var rows = new System.Text.StringBuilder();
        rows.Append("<tr><td style='padding:0 36px 20px;'><table width='100%' cellpadding='0' cellspacing='0' style='background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;padding:16px 18px;'><tr><td>");
        rows.Append("<div style='font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;'>&#128222; İletişim</div>");

        if (!string.IsNullOrWhiteSpace(phone))
            rows.Append($"<div style='font-size:13px;color:#0f172a;margin-bottom:4px;'><strong>Tel:</strong> <a href='tel:{H(phone)}' style='color:#0f172a;text-decoration:none;'>{H(phone)}</a></div>");
        if (!string.IsNullOrWhiteSpace(email))
            rows.Append($"<div style='font-size:13px;color:#0f172a;'><strong>E-posta:</strong> <a href='mailto:{H(email)}' style='color:#7c3aed;text-decoration:none;'>{H(email)}</a></div>");

        rows.Append("</td></tr></table></td></tr>");
        return rows.ToString();
    }

    private static string H(string? s) =>
        System.Net.WebUtility.HtmlEncode(s ?? "");
}

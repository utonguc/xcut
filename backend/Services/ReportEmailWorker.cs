using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace XCut.Api.Services;

public class ReportEmailWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReportEmailWorker> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    public ReportEmailWorker(IServiceScopeFactory scopeFactory, ILogger<ReportEmailWorker> log)
    {
        _scopeFactory = scopeFactory;
        _log          = log;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _log.LogInformation("ReportEmailWorker started.");
        while (!ct.IsCancellationRequested)
        {
            try   { await ProcessDueReportsAsync(ct); }
            catch (Exception ex) { _log.LogError(ex, "ReportEmailWorker error."); }
            await Task.Delay(Interval, ct).ConfigureAwait(false);
        }
    }

    private async Task ProcessDueReportsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var due = await db.ScheduledReports
            .Where(r => r.IsActive && r.NextRunAtUtc <= DateTime.UtcNow)
            .ToListAsync(ct);

        foreach (var report in due)
        {
            try
            {
                var salon = await db.Salons.FindAsync(new object[] { report.SalonId }, ct);
                var (f, t) = ResolvePeriod(report.Frequency, report.FiltersJson);
                var html  = await BuildReportHtmlAsync(db, report.SalonId, report.ReportType, report.FiltersJson, salon?.Name, f, t);

                var recipients = (report.RecipientEmails ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

                foreach (var to in recipients)
                    await email.SendAsync(to, $"[xCut] {report.Name} — {DateTime.UtcNow:dd.MM.yyyy}", html);

                report.LastSentAtUtc = DateTime.UtcNow;
                var h = report.SendHour;
                report.NextRunAtUtc = report.Frequency switch
                {
                    "daily"   => DateTime.UtcNow.Date.AddDays(1).AddHours(h),
                    "weekly"  => DateTime.UtcNow.Date.AddDays(7).AddHours(h),
                    "monthly" => new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, h, 0, 0, DateTimeKind.Utc).AddMonths(1),
                    _         => DateTime.UtcNow.Date.AddDays(1).AddHours(h),
                };
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Report {Id} send failed.", report.Id);
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private static (DateTime from, DateTime to) ResolvePeriod(string frequency, string? filtersJson)
    {
        var now = DateTime.UtcNow;
        // Try to extract period from filtersJson first
        var period = "month";
        if (!string.IsNullOrWhiteSpace(filtersJson) && filtersJson.Contains("\"period\""))
        {
            var m = System.Text.RegularExpressions.Regex.Match(filtersJson, "\"period\"\\s*:\\s*\"([^\"]+)\"");
            if (m.Success) period = m.Groups[1].Value;
        }
        if (period == "month") // if still default, map from frequency
        {
            period = frequency switch { "daily" => "today", "weekly" => "week", _ => "month" };
        }
        return period switch
        {
            "today" => (now.Date.AddDays(-1), now.Date),
            "week"  => (now.Date.AddDays(-7), now.Date),
            "year"  => (new DateTime(now.Year - 1, 1, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            _       => (new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-1),
                        new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc)),
        };
    }

    private static readonly string ReportCss =
        "<html><head><meta charset=\"utf-8\"><style>" +
        "body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff;padding:24px}" +
        "h1{color:#7c3aed;font-size:22px;margin-bottom:4px}" +
        "h2{color:#374151;font-size:16px;margin:20px 0 8px}" +
        "table{width:100%;border-collapse:collapse;margin-bottom:16px}" +
        "th{background:#f5f3ff;padding:8px 12px;text-align:left;font-size:13px;font-weight:700;color:#6b7280}" +
        "td{padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px}" +
        ".kpi{display:inline-block;background:#f5f3ff;border-radius:8px;padding:12px 20px;margin:4px;min-width:140px}" +
        ".kpi-val{font-size:20px;font-weight:900;color:#7c3aed}" +
        ".kpi-lbl{font-size:12px;color:#6b7280;margin-top:2px}" +
        ".footer{margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #f1f5f9;padding-top:12px}" +
        "</style></head><body>";

    private static string KpiBox(string label, string value) =>
        $"<div class=\"kpi\"><div class=\"kpi-val\">{value}</div><div class=\"kpi-lbl\">{label}</div></div>";

    private static async Task<string> BuildReportHtmlAsync(
        AppDbContext db, Guid salonId, string reportType, string? filtersJson,
        string? salonName, DateTime f, DateTime t)
    {
        var sb = new StringBuilder();
        sb.Append(ReportCss);
        sb.AppendLine($"<h1>xCut Raporu — {salonName ?? "Salon"}</h1>");
        sb.AppendLine($"<div style=\"color:#6b7280;font-size:13px;margin-bottom:20px\">Dönem: {f:dd.MM.yyyy} – {t.AddSeconds(-1):dd.MM.yyyy}</div>");

        if (reportType is "revenue" or "full")
        {
            var txs = await db.PosTransactions
                .Where(x => x.SalonId == salonId && x.Status == "completed" && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
                .ToListAsync();
            var expenses = await db.CashExpenses
                .Where(e => e.SalonId == salonId && e.CreatedAtUtc >= f && e.CreatedAtUtc < t)
                .SumAsync(e => (decimal?)e.Amount) ?? 0;

            var totalRev  = txs.Sum(x => x.Total);
            var totalCash = txs.Sum(x => x.CashAmount);
            var totalCard = txs.Sum(x => x.CardAmount);

            sb.AppendLine("<h2>Gelir Özeti</h2><div>");
            sb.Append(KpiBox("Toplam Ciro", $"₺{totalRev:N2}"));
            sb.Append(KpiBox("Nakit",       $"₺{totalCash:N2}"));
            sb.Append(KpiBox("Kart",        $"₺{totalCard:N2}"));
            sb.Append(KpiBox("Masraf",      $"₺{expenses:N2}"));
            sb.Append(KpiBox("İşlem",       txs.Count.ToString()));
            sb.AppendLine("</div>");
        }

        if (reportType is "services" or "full")
        {
            var items = await db.PosTransactionItems
                .Include(i => i.Transaction)
                .Where(i => i.Transaction!.SalonId == salonId && i.Transaction.Status == "completed"
                         && i.Transaction.CreatedAtUtc >= f && i.Transaction.CreatedAtUtc < t)
                .ToListAsync();
            var grouped = items.GroupBy(i => i.Name)
                .Select(g => new { Name = g.Key, Count = g.Sum(i => i.Quantity), Revenue = g.Sum(i => i.LineTotal) })
                .OrderByDescending(x => x.Revenue).Take(10).ToList();

            sb.AppendLine("<h2>En Çok Satan Hizmetler / Ürünler</h2>");
            sb.AppendLine("<table><thead><tr><th>Hizmet/Ürün</th><th>Adet</th><th>Ciro</th></tr></thead><tbody>");
            foreach (var row in grouped)
                sb.AppendLine($"<tr><td>{row.Name}</td><td>{row.Count}</td><td>₺{row.Revenue:N2}</td></tr>");
            sb.AppendLine("</tbody></table>");
        }

        if (reportType is "stylists" or "full")
        {
            var txs = await db.PosTransactions
                .Include(x => x.Stylist)
                .Where(x => x.SalonId == salonId && x.Status == "completed" && x.StylistId.HasValue && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
                .ToListAsync();
            var rows = txs.GroupBy(x => x.StylistId)
                .Select(g => new { Name = g.First().Stylist?.FullName ?? "—", Rev = g.Sum(x => x.Total), Cnt = g.Count() })
                .OrderByDescending(x => x.Rev).ToList();

            sb.AppendLine("<h2>Stilist Performansı</h2>");
            sb.AppendLine("<table><thead><tr><th>Stilist</th><th>İşlem</th><th>Ciro</th><th>Ort. Sepet</th></tr></thead><tbody>");
            foreach (var r in rows)
            {
                var avg = r.Cnt > 0 ? r.Rev / r.Cnt : 0;
                sb.AppendLine($"<tr><td>{r.Name}</td><td>{r.Cnt}</td><td>₺{r.Rev:N2}</td><td>₺{avg:N2}</td></tr>");
            }
            sb.AppendLine("</tbody></table>");
        }

        sb.AppendLine($"<div class=\"footer\">Bu rapor xCut tarafından {DateTime.UtcNow:dd.MM.yyyy HH:mm} UTC tarihinde oluşturulmuştur.</div></body></html>");
        return sb.ToString();
    }
}

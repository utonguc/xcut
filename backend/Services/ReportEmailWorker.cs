using XCut.Api.Data;
using Microsoft.EntityFrameworkCore;

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
        var db          = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email       = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var due = await db.ScheduledReports
            .Where(r => r.IsActive && r.NextRunAtUtc <= DateTime.UtcNow)
            .ToListAsync(ct);

        foreach (var report in due)
        {
            try
            {
                var recipients = (report.RecipientEmails ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

                foreach (var to in recipients)
                    await email.SendAsync(to, $"[xCut] {report.Name}", $"Zamanlanmış rapor: {report.Name}");

                report.LastSentAtUtc = DateTime.UtcNow;
                report.NextRunAtUtc = report.Frequency switch
                {
                    "daily"   => DateTime.UtcNow.AddDays(1),
                    "weekly"  => DateTime.UtcNow.AddDays(7),
                    "monthly" => DateTime.UtcNow.AddMonths(1),
                    _         => DateTime.UtcNow.AddDays(1),
                };
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Report {Id} send failed.", report.Id);
            }
        }

        await db.SaveChangesAsync(ct);
    }
}

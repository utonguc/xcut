using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEmailService _email;

    public ReportsController(AppDbContext db, IEmailService email)
    {
        _db   = db;
        _email = email;
    }

    private Guid? GetSalonId()
    {
        var claim = User.FindFirstValue("salonId") ?? User.FindFirstValue("SalonId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    // ── Date range helpers ────────────────────────────────────────────────────

    private static (DateTime from, DateTime to) ResolvePeriod(string period, DateTime? customFrom, DateTime? customTo)
    {
        var now = DateTime.UtcNow;
        if (period == "custom" && customFrom.HasValue && customTo.HasValue)
            return (customFrom.Value.ToUniversalTime(), customTo.Value.ToUniversalTime().AddDays(1));

        return period switch
        {
            "today" => (now.Date, now.Date.AddDays(1)),
            "week"  => (now.Date.AddDays(-(int)now.DayOfWeek == 0 ? 6 : (int)now.DayOfWeek - 1), now.Date.AddDays(1)),
            "year"  => (new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(now.Year + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            _       => (new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1)),
        };
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var txs = await _db.PosTransactions
            .Where(x => x.SalonId == salonId && x.Status == "completed"
                     && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
            .ToListAsync();

        var expenses = await _db.CashExpenses
            .Where(e => e.SalonId == salonId && e.CreatedAtUtc >= f && e.CreatedAtUtc < t)
            .SumAsync(e => (decimal?)e.Amount) ?? 0;

        var buckets = txs
            .GroupBy(x => period == "year"
                ? x.CreatedAtUtc.ToString("yyyy-MM")
                : x.CreatedAtUtc.Date.ToString("yyyy-MM-dd"))
            .Select(g => new PeriodBucket
            {
                Label   = g.Key,
                Revenue = g.Sum(x => x.Total),
                Cash    = g.Sum(x => x.CashAmount),
                Card    = g.Sum(x => x.CardAmount),
                Bank    = g.Sum(x => x.BankAmount),
                Count   = g.Count(),
            })
            .OrderBy(b => b.Label)
            .ToList();

        return Ok(new PeriodSummaryResponse
        {
            TotalRevenue  = txs.Sum(x => x.Total),
            TotalCash     = txs.Sum(x => x.CashAmount),
            TotalCard     = txs.Sum(x => x.CardAmount),
            TotalBank     = txs.Sum(x => x.BankAmount),
            TotalExpenses = expenses,
            TxCount       = txs.Count,
            Buckets       = buckets,
        });
    }

    // ── Transactions list ─────────────────────────────────────────────────────

    [HttpGet("transactions")]
    public async Task<IActionResult> Transactions(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? stylistId,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var q = _db.PosTransactions
            .Include(t => t.Stylist)
            .Include(t => t.Items)
            .Where(t => t.SalonId == salonId);

        if (from.HasValue)
            q = q.Where(t => t.CreatedAtUtc >= from.Value.ToUniversalTime());
        if (to.HasValue)
            q = q.Where(t => t.CreatedAtUtc <= to.Value.ToUniversalTime().AddDays(1));
        if (!string.IsNullOrWhiteSpace(stylistId) && Guid.TryParse(stylistId, out var sid))
            q = q.Where(t => t.StylistId == sid);
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(t => t.CustomerName != null && t.CustomerName.ToLower().Contains(search.ToLower()));

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(t => t.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new TransactionListItem
            {
                Id            = t.Id.ToString(),
                StylistName   = t.Stylist != null ? t.Stylist.FullName : null,
                CustomerName  = t.CustomerName,
                Total         = t.Total,
                CashAmount    = t.CashAmount,
                CardAmount    = t.CardAmount,
                BankAmount    = t.BankAmount,
                PaymentMethod = t.PaymentMethod,
                Status        = t.Status,
                CreatedAtUtc  = t.CreatedAtUtc,
                ItemCount     = t.Items.Count,
            })
            .ToListAsync();

        return Ok(new PagedResult<TransactionListItem>
        {
            Items    = items,
            Total    = total,
            Page     = page,
            PageSize = pageSize,
        });
    }

    // ── Transaction detail ────────────────────────────────────────────────────

    [HttpGet("transactions/{id:guid}")]
    public async Task<IActionResult> TransactionDetail(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var t = await _db.PosTransactions
            .Include(x => x.Stylist)
            .Include(x => x.Items)
            .Include(x => x.Session)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId);

        if (t is null) return NotFound();

        var salon = await _db.Salons.FindAsync(salonId);

        return Ok(new TransactionDetailResponse
        {
            Id             = t.Id.ToString(),
            StylistName    = t.Stylist?.FullName,
            CustomerName   = t.CustomerName,
            Subtotal       = t.Subtotal,
            DiscountType   = t.DiscountType,
            DiscountValue  = t.DiscountValue,
            DiscountAmount = t.DiscountAmount,
            Total          = t.Total,
            CashAmount     = t.CashAmount,
            CardAmount     = t.CardAmount,
            BankAmount     = t.BankAmount,
            PaymentMethod  = t.PaymentMethod,
            Status         = t.Status,
            CreatedAtUtc   = t.CreatedAtUtc,
            SalonName      = salon?.Name,
            Items          = t.Items.Select(i => new TransactionItemDto
            {
                Name      = i.Name,
                UnitPrice = i.UnitPrice,
                Quantity  = i.Quantity,
                LineTotal = i.LineTotal,
            }).ToList(),
        });
    }

    // ── Commissions ───────────────────────────────────────────────────────────

    [HttpGet("commissions")]
    public async Task<IActionResult> Commissions(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var stylists = await _db.Stylists
            .Where(s => s.SalonId == salonId.Value)
            .ToListAsync();

        var stylistTxs = await _db.PosTransactions
            .Where(x => x.SalonId == salonId.Value && x.Status == "completed"
                        && x.StylistId.HasValue && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
            .ToListAsync();

        var rows = new List<CommissionRowDto>();
        foreach (var s in stylists)
        {
            var ts         = stylistTxs.Where(x => x.StylistId == s.Id).ToList();
            var revenue    = ts.Sum(x => x.Total);
            var commission = s.PayType == "commission" ? revenue * s.CommissionRate / 100m : 0m;
            rows.Add(new CommissionRowDto
            {
                StylistId      = s.Id,
                StylistName    = s.FullName,
                PayType        = s.PayType,
                CommissionRate = s.CommissionRate,
                FixedSalary    = s.FixedSalary,
                Revenue        = revenue,
                Commission     = commission,
                TxCount        = ts.Count,
            });
        }

        return Ok(rows.OrderByDescending(r => r.Revenue).ToList());
    }

    // ── Analytics: Services ───────────────────────────────────────────────────

    [HttpGet("analytics/services")]
    public async Task<IActionResult> AnalyticsServices(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var items = await _db.PosTransactionItems
            .Include(i => i.Transaction)
            .Where(i => i.Transaction!.SalonId == salonId
                     && i.Transaction.Status == "completed"
                     && i.Transaction.CreatedAtUtc >= f
                     && i.Transaction.CreatedAtUtc < t)
            .ToListAsync();

        var grouped = items
            .GroupBy(i => i.Name)
            .Select(g => new ServiceAnalyticsItem
            {
                Name     = g.Key,
                Count    = g.Sum(i => i.Quantity),
                Revenue  = g.Sum(i => i.LineTotal),
                AvgPrice = g.Average(i => i.UnitPrice),
            })
            .OrderByDescending(x => x.Revenue)
            .Take(20)
            .ToList();

        return Ok(grouped);
    }

    // ── Analytics: Customers ──────────────────────────────────────────────────

    [HttpGet("analytics/customers")]
    public async Task<IActionResult> AnalyticsCustomers(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var newCustomerCount = await _db.Customers
            .Where(c => c.SalonId == salonId.Value && c.CreatedAtUtc >= f && c.CreatedAtUtc < t)
            .CountAsync();

        var txsInPeriod = await _db.PosTransactions
            .Where(x => x.SalonId == salonId && x.Status == "completed"
                     && x.CustomerId.HasValue
                     && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
            .ToListAsync();

        var allTxs = await _db.PosTransactions
            .Where(x => x.SalonId == salonId && x.Status == "completed" && x.CustomerId.HasValue)
            .Select(x => new { x.CustomerId, x.CreatedAtUtc })
            .ToListAsync();

        var uniqueInPeriod = txsInPeriod.Select(x => x.CustomerId).Distinct().ToHashSet();
        var returningCount = 0;
        foreach (var cid in uniqueInPeriod)
        {
            if (allTxs.Any(x => x.CustomerId == cid && x.CreatedAtUtc < f))
                returningCount++;
        }

        var topCustomers = txsInPeriod
            .GroupBy(x => x.CustomerId)
            .Select(g => new
            {
                CustomerId = g.Key,
                Visits     = g.Count(),
                Spent      = g.Sum(x => x.Total),
                Name       = g.First().CustomerName ?? "Bilinmiyor",
            })
            .OrderByDescending(x => x.Spent)
            .Take(10)
            .Select(x => new TopCustomerItem { Name = x.Name, Visits = x.Visits, Spent = x.Spent })
            .ToList();

        return Ok(new CustomerAnalyticsResponse
        {
            NewCustomerCount       = newCustomerCount,
            ReturningCustomerCount = returningCount,
            TopCustomers           = topCustomers,
        });
    }

    // ── Analytics: Hourly ─────────────────────────────────────────────────────

    [HttpGet("analytics/hourly")]
    public async Task<IActionResult> AnalyticsHourly(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var txs = await _db.PosTransactions
            .Where(x => x.SalonId == salonId && x.Status == "completed"
                     && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
            .Select(x => new { x.CreatedAtUtc, x.Total })
            .ToListAsync();

        var buckets = txs
            .GroupBy(x => x.CreatedAtUtc.Hour)
            .Select(g => new HourlyBucket
            {
                Hour    = g.Key,
                Count   = g.Count(),
                Revenue = g.Sum(x => x.Total),
            })
            .OrderBy(b => b.Hour)
            .ToList();

        return Ok(buckets);
    }

    // ── Analytics: Stylist performance ────────────────────────────────────────

    [HttpGet("analytics/stylists")]
    public async Task<IActionResult> AnalyticsStylists(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var txs = await _db.PosTransactions
            .Include(x => x.Stylist)
            .Where(x => x.SalonId == salonId && x.Status == "completed"
                     && x.StylistId.HasValue
                     && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
            .ToListAsync();

        var rows = txs
            .GroupBy(x => x.StylistId)
            .Select(g =>
            {
                var rev = g.Sum(x => x.Total);
                var cnt = g.Count();
                return new StylistPerformanceItem
                {
                    Name          = g.First().Stylist?.FullName ?? "—",
                    TxCount       = cnt,
                    Revenue       = rev,
                    AvgTicket     = cnt > 0 ? rev / cnt : 0,
                    CustomerCount = g.Select(x => x.CustomerId).Distinct().Count(c => c.HasValue),
                };
            })
            .OrderByDescending(x => x.Revenue)
            .ToList();

        return Ok(rows);
    }

    // ── Analytics: Appointments ───────────────────────────────────────────────

    [HttpGet("analytics/appointments")]
    public async Task<IActionResult> AnalyticsAppointments(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var appts = await _db.Appointments
            .Include(a => a.Stylist)
            .Where(a => a.SalonId == salonId && a.StartAtUtc >= f && a.StartAtUtc < t)
            .ToListAsync();

        var total     = appts.Count;
        var completed = appts.Count(a => a.Status == "Completed");
        var cancelled = appts.Count(a => a.Status == "Cancelled");
        var noShow    = appts.Count(a => a.Status == "NoShow");
        var scheduled = appts.Count(a => a.Status == "Scheduled" || a.Status == "InProgress");

        var byStylist = appts
            .GroupBy(a => a.StylistId)
            .Select(g => new StylistAppointmentItem
            {
                Name      = g.First().Stylist?.FullName ?? "Atanmadı",
                Total     = g.Count(),
                Completed = g.Count(a => a.Status == "Completed"),
                Cancelled = g.Count(a => a.Status == "Cancelled"),
            })
            .OrderByDescending(x => x.Total)
            .ToList();

        return Ok(new AppointmentAnalyticsResponse
        {
            Total          = total,
            Completed      = completed,
            Cancelled      = cancelled,
            NoShow         = noShow,
            Scheduled      = scheduled,
            CompletionRate = total > 0 ? Math.Round((decimal)completed / total * 100, 1) : 0,
            ByStylist      = byStylist,
        });
    }

    // ── Analytics: Payments ───────────────────────────────────────────────────

    [HttpGet("analytics/payments")]
    public async Task<IActionResult> AnalyticsPayments(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var txs = await _db.PosTransactions
            .Where(x => x.SalonId == salonId && x.Status == "completed"
                     && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
            .ToListAsync();

        var totalAmount = txs.Sum(x => x.Total);

        var breakdown = new List<PaymentBreakdownItem>
        {
            new() { Method = "Nakit",   Count = txs.Count(x => x.CashAmount > 0), Amount = txs.Sum(x => x.CashAmount), Pct = totalAmount > 0 ? Math.Round(txs.Sum(x => x.CashAmount) / totalAmount * 100, 1) : 0 },
            new() { Method = "Kart",    Count = txs.Count(x => x.CardAmount > 0), Amount = txs.Sum(x => x.CardAmount), Pct = totalAmount > 0 ? Math.Round(txs.Sum(x => x.CardAmount) / totalAmount * 100, 1) : 0 },
            new() { Method = "Havale",  Count = txs.Count(x => x.BankAmount > 0), Amount = txs.Sum(x => x.BankAmount), Pct = totalAmount > 0 ? Math.Round(txs.Sum(x => x.BankAmount) / totalAmount * 100, 1) : 0 },
        };

        return Ok(breakdown.Where(b => b.Amount > 0).OrderByDescending(b => b.Amount).ToList());
    }

    // ── Analytics: Expenses ───────────────────────────────────────────────────

    [HttpGet("analytics/expenses")]
    public async Task<IActionResult> AnalyticsExpenses(
        [FromQuery] string period = "month",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to   = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var (f, t) = ResolvePeriod(period, from, to);

        var expenses = await _db.CashExpenses
            .Where(e => e.SalonId == salonId && e.CreatedAtUtc >= f && e.CreatedAtUtc < t)
            .ToListAsync();

        var grouped = expenses
            .GroupBy(e => e.Category)
            .Select(g => new ExpenseAnalyticsItem
            {
                Category = g.Key,
                Count    = g.Count(),
                Amount   = g.Sum(e => e.Amount),
            })
            .OrderByDescending(x => x.Amount)
            .ToList();

        return Ok(grouped);
    }

    // ── Scheduled Reports: CRUD ───────────────────────────────────────────────

    [HttpGet("scheduled")]
    public async Task<IActionResult> GetScheduled()
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var list = await _db.ScheduledReports
            .Where(r => r.SalonId == salonId.Value)
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToListAsync();

        return Ok(list.Select(ToScheduledResponse));
    }

    [HttpPost("scheduled")]
    public async Task<IActionResult> CreateScheduled([FromBody] CreateScheduledReportRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var report = new ScheduledReport
        {
            SalonId         = salonId.Value,
            Name            = req.Name.Trim(),
            ReportType      = req.ReportType,
            Frequency       = req.Frequency,
            SendHour        = Math.Clamp(req.SendHour, 0, 23),
            RecipientEmails = req.RecipientEmails?.Trim(),
            FiltersJson     = req.FiltersJson,
            IsActive        = req.Frequency != "once",
            NextRunAtUtc    = req.Frequency == "once" ? null : ComputeNextRun(req.Frequency, req.SendHour),
        };

        _db.ScheduledReports.Add(report);
        await _db.SaveChangesAsync();

        // For one-time: send immediately
        if (req.Frequency == "once" && !string.IsNullOrWhiteSpace(req.RecipientEmails))
        {
            var html = await BuildReportHtmlAsync(salonId.Value, req.ReportType, req.FiltersJson);
            var recipients = req.RecipientEmails.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var addr in recipients)
                await _email.SendAsync(addr, $"[xCut] {req.Name}", html);
            report.LastSentAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        return Ok(ToScheduledResponse(report));
    }

    [HttpPut("scheduled/{id:guid}")]
    public async Task<IActionResult> UpdateScheduled(Guid id, [FromBody] UpdateScheduledReportRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var report = await _db.ScheduledReports.FirstOrDefaultAsync(r => r.Id == id && r.SalonId == salonId.Value);
        if (report is null) return NotFound();

        report.Name            = req.Name.Trim();
        report.ReportType      = req.ReportType;
        report.Frequency       = req.Frequency;
        report.SendHour        = Math.Clamp(req.SendHour, 0, 23);
        report.RecipientEmails = req.RecipientEmails?.Trim();
        report.FiltersJson     = req.FiltersJson;
        report.IsActive        = req.Frequency != "once";
        report.NextRunAtUtc    = req.Frequency == "once" ? null : ComputeNextRun(req.Frequency, req.SendHour);

        await _db.SaveChangesAsync();
        return Ok(ToScheduledResponse(report));
    }

    [HttpDelete("scheduled/{id:guid}")]
    public async Task<IActionResult> DeleteScheduled(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var report = await _db.ScheduledReports.FirstOrDefaultAsync(r => r.Id == id && r.SalonId == salonId.Value);
        if (report is null) return NotFound();

        _db.ScheduledReports.Remove(report);
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPatch("scheduled/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleScheduled(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var report = await _db.ScheduledReports.FirstOrDefaultAsync(r => r.Id == id && r.SalonId == salonId.Value);
        if (report is null) return NotFound();

        report.IsActive = !report.IsActive;
        if (report.IsActive && report.NextRunAtUtc is null)
            report.NextRunAtUtc = ComputeNextRun(report.Frequency, report.SendHour);

        await _db.SaveChangesAsync();
        return Ok(ToScheduledResponse(report));
    }

    // ── Send now (one-time ad-hoc) ────────────────────────────────────────────

    [HttpPost("send-now")]
    public async Task<IActionResult> SendNow([FromBody] SendReportNowRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var filtersJson = $"{{\"period\":\"{req.Period}\"}}";
        var html = await BuildReportHtmlAsync(salonId.Value, req.ReportType, filtersJson, req.From, req.To);

        var recipients = req.RecipientEmails.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var addr in recipients)
            await _email.SendAsync(addr, $"[xCut] Rapor — {DateTime.UtcNow:dd.MM.yyyy}", html);

        return Ok(new { sent = recipients.Length });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static DateTime ComputeNextRun(string frequency, int sendHour = 8)
    {
        var now = DateTime.UtcNow;
        var candidate = now.Date.AddHours(sendHour);
        return frequency switch
        {
            "daily"   => candidate > now ? candidate : candidate.AddDays(1),
            "weekly"  => candidate > now ? candidate.AddDays(7) : candidate.AddDays(7),
            "monthly" => new DateTime(now.Year, now.Month, 1, sendHour, 0, 0, DateTimeKind.Utc).AddMonths(1),
            _         => candidate > now ? candidate.AddDays(1) : candidate.AddDays(2),
        };
    }

    private static readonly Dictionary<string, string> ReportTypeLabels = new()
    {
        ["revenue"]      = "Gelir Özeti",
        ["services"]     = "Hizmet Analizi",
        ["customers"]    = "Müşteri Analizi",
        ["stylists"]     = "Stilist Performansı",
        ["appointments"] = "Randevu Raporu",
        ["payments"]     = "Ödeme Analizi",
        ["expenses"]     = "Masraf Raporu",
        ["full"]         = "Tam Rapor",
    };

    private static ScheduledReportResponse ToScheduledResponse(ScheduledReport r) => new()
    {
        Id              = r.Id,
        Name            = r.Name,
        ReportType      = r.ReportType,
        ReportTypeLabel = ReportTypeLabels.GetValueOrDefault(r.ReportType, r.ReportType),
        Frequency       = r.Frequency,
        SendHour        = r.SendHour,
        RecipientEmails = r.RecipientEmails,
        FiltersJson     = r.FiltersJson,
        IsActive        = r.IsActive,
        LastSentAtUtc   = r.LastSentAtUtc,
        NextRunAtUtc    = r.NextRunAtUtc,
        CreatedAtUtc    = r.CreatedAtUtc,
    };

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

    private async Task<string> BuildReportHtmlAsync(Guid salonId, string reportType, string? filtersJson,
        DateTime? customFrom = null, DateTime? customTo = null)
    {
        var period = "month";
        if (!string.IsNullOrWhiteSpace(filtersJson) && filtersJson.Contains("\"period\""))
        {
            var match = System.Text.RegularExpressions.Regex.Match(filtersJson, "\"period\"\\s*:\\s*\"([^\"]+)\"");
            if (match.Success) period = match.Groups[1].Value;
        }

        var (f, t) = ResolvePeriod(period, customFrom, customTo);
        var salon  = await _db.Salons.FindAsync(salonId);
        var sb     = new StringBuilder();

        sb.Append(ReportCss);
        sb.AppendLine($"<h1>xCut Raporu — {salon?.Name ?? "Salon"}</h1>");
        sb.AppendLine($"<div style=\"color:#6b7280;font-size:13px;margin-bottom:20px\">Dönem: {f:dd.MM.yyyy} – {t.AddSeconds(-1):dd.MM.yyyy}</div>");

        if (reportType is "revenue" or "full")
        {
            var txs = await _db.PosTransactions
                .Where(x => x.SalonId == salonId && x.Status == "completed" && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
                .ToListAsync();
            var expenses = await _db.CashExpenses
                .Where(e => e.SalonId == salonId && e.CreatedAtUtc >= f && e.CreatedAtUtc < t)
                .SumAsync(e => (decimal?)e.Amount) ?? 0;

            var totalRev  = txs.Sum(x => x.Total);
            var totalCash = txs.Sum(x => x.CashAmount);
            var totalCard = txs.Sum(x => x.CardAmount);
            var totalBank = txs.Sum(x => x.BankAmount);

            sb.AppendLine("<h2>Gelir Özeti</h2><div>");
            sb.Append(KpiBox("Toplam Ciro",    $"₺{totalRev:N2}"));
            sb.Append(KpiBox("Nakit",          $"₺{totalCash:N2}"));
            sb.Append(KpiBox("Kart",           $"₺{totalCard:N2}"));
            sb.Append(KpiBox("Havale",         $"₺{totalBank:N2}"));
            sb.Append(KpiBox("Masraf",         $"₺{expenses:N2}"));
            sb.Append(KpiBox("İşlem Sayısı", txs.Count.ToString()));
            sb.AppendLine("</div>");
        }

        if (reportType is "services" or "full")
        {
            var items = await _db.PosTransactionItems
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

        if (reportType is "customers" or "full")
        {
            var newCount = await _db.Customers.CountAsync(c => c.SalonId == salonId && c.CreatedAtUtc >= f && c.CreatedAtUtc < t);
            var topTxs   = await _db.PosTransactions
                .Where(x => x.SalonId == salonId && x.Status == "completed" && x.CustomerId.HasValue && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
                .ToListAsync();
            var topCustomers = topTxs.GroupBy(x => x.CustomerId)
                .Select(g => new { Name = g.First().CustomerName ?? "Bilinmiyor", Visits = g.Count(), Spent = g.Sum(x => x.Total) })
                .OrderByDescending(x => x.Spent).Take(5).ToList();

            sb.AppendLine("<h2>Müşteri Analizi</h2>");
            sb.AppendLine($"<p>Bu dönemde <strong>{newCount}</strong> yeni müşteri kaydedildi.</p>");
            if (topCustomers.Any())
            {
                sb.AppendLine("<table><thead><tr><th>Müşteri</th><th>Ziyaret</th><th>Harcama</th></tr></thead><tbody>");
                foreach (var c in topCustomers)
                    sb.AppendLine($"<tr><td>{c.Name}</td><td>{c.Visits}</td><td>₺{c.Spent:N2}</td></tr>");
                sb.AppendLine("</tbody></table>");
            }
        }

        if (reportType is "stylists" or "full")
        {
            var txs = await _db.PosTransactions
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

        if (reportType is "appointments" or "full")
        {
            var appts = await _db.Appointments
                .Include(a => a.Stylist)
                .Where(a => a.SalonId == salonId && a.StartAtUtc >= f && a.StartAtUtc < t)
                .ToListAsync();

            var total     = appts.Count;
            var completed = appts.Count(a => a.Status == "Completed");
            var cancelled = appts.Count(a => a.Status == "Cancelled");
            var noShow    = appts.Count(a => a.Status == "NoShow");
            var rate      = total > 0 ? (decimal)completed / total * 100 : 0;

            sb.AppendLine("<h2>Randevu Raporu</h2><div>");
            sb.Append(KpiBox("Toplam",    total.ToString()));
            sb.Append(KpiBox("Tamamlanan", completed.ToString()));
            sb.Append(KpiBox("İptal",     cancelled.ToString()));
            sb.Append(KpiBox("Gelmedi",   noShow.ToString()));
            sb.Append(KpiBox("Tamamlanma", $"%{rate:F1}"));
            sb.AppendLine("</div>");

            var byStylist = appts.GroupBy(a => a.StylistId)
                .Select(g => new { Name = g.First().Stylist?.FullName ?? "Atanmadı", Total = g.Count(), Done = g.Count(a => a.Status == "Completed") })
                .OrderByDescending(x => x.Total).ToList();
            if (byStylist.Any())
            {
                sb.AppendLine("<table><thead><tr><th>Stilist</th><th>Toplam</th><th>Tamamlanan</th></tr></thead><tbody>");
                foreach (var r in byStylist)
                    sb.AppendLine($"<tr><td>{r.Name}</td><td>{r.Total}</td><td>{r.Done}</td></tr>");
                sb.AppendLine("</tbody></table>");
            }
        }

        if (reportType is "payments" or "full")
        {
            var txs = await _db.PosTransactions
                .Where(x => x.SalonId == salonId && x.Status == "completed" && x.CreatedAtUtc >= f && x.CreatedAtUtc < t)
                .ToListAsync();
            var totalAmt = txs.Sum(x => x.Total);
            var cash = txs.Sum(x => x.CashAmount);
            var card = txs.Sum(x => x.CardAmount);
            var bank = txs.Sum(x => x.BankAmount);

            sb.AppendLine("<h2>Ödeme Analizi</h2>");
            sb.AppendLine("<table><thead><tr><th>Yöntem</th><th>Tutar</th><th>Pay</th></tr></thead><tbody>");
            if (cash > 0) sb.AppendLine($"<tr><td>Nakit</td><td>₺{cash:N2}</td><td>%{(totalAmt>0?cash/totalAmt*100:0):F1}</td></tr>");
            if (card > 0) sb.AppendLine($"<tr><td>Kart</td><td>₺{card:N2}</td><td>%{(totalAmt>0?card/totalAmt*100:0):F1}</td></tr>");
            if (bank > 0) sb.AppendLine($"<tr><td>Havale</td><td>₺{bank:N2}</td><td>%{(totalAmt>0?bank/totalAmt*100:0):F1}</td></tr>");
            sb.AppendLine("</tbody></table>");
        }

        if (reportType is "expenses" or "full")
        {
            var exps = await _db.CashExpenses
                .Where(e => e.SalonId == salonId && e.CreatedAtUtc >= f && e.CreatedAtUtc < t)
                .ToListAsync();
            var total = exps.Sum(e => e.Amount);

            sb.AppendLine("<h2>Masraf Raporu</h2>");
            sb.Append(KpiBox("Toplam Masraf", $"₺{total:N2}"));
            sb.AppendLine("<br>");
            if (exps.Any())
            {
                var cats = exps.GroupBy(e => e.Category).Select(g => new { Cat = g.Key, Amt = g.Sum(e => e.Amount), Cnt = g.Count() }).OrderByDescending(x => x.Amt).ToList();
                sb.AppendLine("<table><thead><tr><th>Kategori</th><th>Adet</th><th>Tutar</th></tr></thead><tbody>");
                foreach (var c in cats)
                    sb.AppendLine($"<tr><td>{c.Cat}</td><td>{c.Cnt}</td><td>₺{c.Amt:N2}</td></tr>");
                sb.AppendLine("</tbody></table>");
            }
        }

        sb.AppendLine($"<div class=\"footer\">Bu rapor xCut tarafından {DateTime.UtcNow:dd.MM.yyyy HH:mm} UTC tarihinde oluşturulmuştur.</div></body></html>");
        return sb.ToString();
    }
}

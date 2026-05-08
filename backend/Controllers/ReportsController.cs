using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
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

    public ReportsController(AppDbContext db) => _db = db;

    private Guid? GetSalonId()
    {
        var claim = User.FindFirstValue("salonId") ?? User.FindFirstValue("SalonId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    // GET /Reports/transactions?from=&to=&stylistId=&search=&page=1&pageSize=50
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

    // GET /Reports/transactions/{id}
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

    // GET /Reports/summary?period=today|week|month|year&date=2026-05-01
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] string period = "month", [FromQuery] DateTime? date = null)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var now = date?.ToUniversalTime() ?? DateTime.UtcNow;
        DateTime from, to;

        switch (period)
        {
            case "today":
                from = now.Date;
                to   = from.AddDays(1);
                break;
            case "week":
                var dow  = (int)now.DayOfWeek;
                from = now.Date.AddDays(-dow + (dow == 0 ? -6 : 1));
                to   = from.AddDays(7);
                break;
            case "year":
                from = new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                to   = from.AddYears(1);
                break;
            default: // month
                from = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                to   = from.AddMonths(1);
                break;
        }

        var txs = await _db.PosTransactions
            .Where(t => t.SalonId == salonId && t.Status == "completed"
                     && t.CreatedAtUtc >= from && t.CreatedAtUtc < to)
            .ToListAsync();

        var expenses = await _db.CashExpenses
            .Where(e => e.SalonId == salonId && e.CreatedAtUtc >= from && e.CreatedAtUtc < to)
            .SumAsync(e => (decimal?)e.Amount) ?? 0;

        // Build daily buckets
        var buckets = txs
            .GroupBy(t => period == "year" ? t.CreatedAtUtc.ToString("yyyy-MM") : t.CreatedAtUtc.Date.ToString("yyyy-MM-dd"))
            .Select(g => new PeriodBucket
            {
                Label   = g.Key,
                Revenue = g.Sum(t => t.Total),
                Cash    = g.Sum(t => t.CashAmount),
                Card    = g.Sum(t => t.CardAmount),
                Bank    = g.Sum(t => t.BankAmount),
                Count   = g.Count(),
            })
            .OrderBy(b => b.Label)
            .ToList();

        return Ok(new PeriodSummaryResponse
        {
            TotalRevenue  = txs.Sum(t => t.Total),
            TotalCash     = txs.Sum(t => t.CashAmount),
            TotalCard     = txs.Sum(t => t.CardAmount),
            TotalBank     = txs.Sum(t => t.BankAmount),
            TotalExpenses = expenses,
            TxCount       = txs.Count,
            Buckets       = buckets,
        });
    }

    // GET /Reports/commissions?period=month|today|week|year
    [HttpGet("commissions")]
    public async Task<IActionResult> Commissions([FromQuery] string period = "month")
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var now = DateTime.UtcNow;
        DateTime from = period switch
        {
            "today" => now.Date,
            "week"  => now.AddDays(-(int)now.DayOfWeek + 1).Date,
            "year"  => new DateTime(now.Year, 1, 1),
            _       => new DateTime(now.Year, now.Month, 1),
        };

        var stylists = await _db.Stylists
            .Where(s => s.SalonId == salonId.Value)
            .ToListAsync();

        var stylistTxs = await _db.PosTransactions
            .Where(t => t.SalonId == salonId.Value && t.Status == "paid" && t.StylistId.HasValue
                        && t.CreatedAtUtc >= from && t.CreatedAtUtc <= now)
            .ToListAsync();

        var rows = new List<CommissionRowDto>();
        foreach (var s in stylists)
        {
            var ts         = stylistTxs.Where(t => t.StylistId == s.Id).ToList();
            var revenue    = ts.Sum(t => t.Total);
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
}

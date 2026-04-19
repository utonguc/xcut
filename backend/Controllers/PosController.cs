using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using XCut.Api.Data;
using XCut.Api.Models;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PosController : ControllerBase
{
    private readonly AppDbContext _db;

    public PosController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    // GET api/Pos/init — stilistler + hizmetler
    [HttpGet("init")]
    public async Task<IActionResult> Init()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var stylists = await _db.Stylists
            .Where(s => s.SalonId == salonId.Value && s.IsActive)
            .OrderBy(s => s.FullName)
            .Select(s => new { s.Id, s.FullName, s.Specialty, s.CommissionRate })
            .ToListAsync();

        var services = await _db.Services
            .Where(s => s.SalonId == salonId.Value && s.IsActive)
            .OrderBy(s => s.Category).ThenBy(s => s.Name)
            .Select(s => new { s.Id, s.Name, s.Category, s.Price, s.DurationMinutes })
            .ToListAsync();

        return Ok(new { stylists, services });
    }

    // POST api/Pos/checkout
    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout([FromBody] PosCheckoutRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { message = "En az bir ürün/hizmet eklenmeli." });

        var subtotal = req.Items.Sum(i => i.UnitPrice * i.Quantity);

        decimal discountAmount = req.DiscountType switch
        {
            "percent" => Math.Round(subtotal * req.DiscountValue / 100, 2),
            "fixed"   => Math.Min(req.DiscountValue, subtotal),
            _         => 0,
        };

        var total = subtotal - discountAmount;
        if (total < 0) total = 0;

        decimal cashAmount = req.PaymentMethod switch
        {
            "cash"  => total,
            "mixed" => req.CashAmount,
            _       => 0,
        };
        decimal cardAmount = req.PaymentMethod switch
        {
            "card"  => total,
            "mixed" => req.CardAmount,
            _       => 0,
        };

        var tx = new PosTransaction
        {
            SalonId        = salonId.Value,
            StylistId      = req.StylistId,
            CustomerName   = req.CustomerName?.Trim(),
            Subtotal       = subtotal,
            DiscountType   = req.DiscountType ?? "none",
            DiscountValue  = req.DiscountValue,
            DiscountAmount = discountAmount,
            Total          = total,
            PaymentMethod  = req.PaymentMethod ?? "cash",
            CashAmount     = cashAmount,
            CardAmount     = cardAmount,
            Notes          = req.Notes,
            Status         = "completed",
        };

        foreach (var item in req.Items)
        {
            tx.Items.Add(new PosTransactionItem
            {
                ServiceId = item.ServiceId,
                Name      = item.Name,
                UnitPrice = item.UnitPrice,
                Quantity  = item.Quantity,
                LineTotal = item.UnitPrice * item.Quantity,
            });
        }

        _db.PosTransactions.Add(tx);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            tx.Id,
            tx.Total,
            tx.CashAmount,
            tx.CardAmount,
            tx.PaymentMethod,
            tx.CreatedAtUtc,
            itemCount = tx.Items.Count,
        });
    }

    // GET api/Pos/monthly-summary?year=2026&month=4
    [HttpGet("monthly-summary")]
    public async Task<IActionResult> MonthlySummary([FromQuery] int year, [FromQuery] int month)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (year < 2020 || year > 2100 || month < 1 || month > 12)
            return BadRequest(new { message = "Geçersiz tarih." });

        var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var to   = from.AddMonths(1);

        var txs = await _db.PosTransactions
            .Where(t => t.SalonId == salonId.Value
                     && t.Status == "completed"
                     && t.CreatedAtUtc >= from
                     && t.CreatedAtUtc < to)
            .Include(t => t.Stylist)
            .ToListAsync();

        // Stilist bazlı gruplama
        var stylistRows = txs
            .Where(t => t.StylistId.HasValue)
            .GroupBy(t => t.StylistId!.Value)
            .Select(g =>
            {
                var stylist      = g.First().Stylist;
                var totalSales   = g.Sum(t => t.Total);
                var commRate     = stylist?.CommissionRate ?? 0;
                var netPay       = Math.Round(totalSales * commRate / 100, 2);
                return new
                {
                    stylistId      = g.Key,
                    stylistName    = stylist?.FullName ?? "—",
                    commissionRate = commRate,
                    totalSales,
                    cashSales   = g.Sum(t => t.CashAmount),
                    cardSales   = g.Sum(t => t.CardAmount),
                    txCount     = g.Count(),
                    netPay,
                    salonCut    = Math.Round(totalSales - netPay, 2),
                };
            })
            .OrderByDescending(r => r.totalSales)
            .ToList();

        // Atanmamış (stilist seçilmemiş) işlemler
        var unassigned = txs.Where(t => !t.StylistId.HasValue).ToList();

        return Ok(new
        {
            year, month,
            totalRevenue   = txs.Sum(t => t.Total),
            totalCash      = txs.Sum(t => t.CashAmount),
            totalCard      = txs.Sum(t => t.CardAmount),
            txCount        = txs.Count,
            stylists       = stylistRows,
            unassignedTotal = unassigned.Sum(t => t.Total),
            unassignedCount = unassigned.Count,
        });
    }

    // GET api/Pos/history?page=1&pageSize=20
    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.PosTransactions
            .Where(t => t.SalonId == salonId.Value)
            .Include(t => t.Stylist)
            .Include(t => t.Items)
            .OrderByDescending(t => t.CreatedAtUtc);

        var total = await q.CountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(t => new
            {
                t.Id, t.CustomerName, t.Total, t.PaymentMethod,
                t.CashAmount, t.CardAmount, t.DiscountAmount, t.Status,
                t.CreatedAtUtc,
                stylistName = t.Stylist != null ? t.Stylist.FullName : null,
                itemCount   = t.Items.Count,
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    // PATCH api/Pos/stylists/{id}/commission
    [HttpPatch("stylists/{id:guid}/commission")]
    public async Task<IActionResult> UpdateCommission(Guid id, [FromBody] UpdateCommissionRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == id && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound();

        if (req.CommissionRate < 0 || req.CommissionRate > 100)
            return BadRequest(new { message = "Komisyon oranı 0-100 arasında olmalı." });

        stylist.CommissionRate = req.CommissionRate;
        await _db.SaveChangesAsync();
        return Ok(new { stylist.Id, stylist.CommissionRate });
    }
}

public record PosCheckoutRequest(
    Guid?   StylistId,
    string? CustomerName,
    List<PosItemRequest> Items,
    string? DiscountType,
    decimal DiscountValue,
    string? PaymentMethod,
    decimal CashAmount,
    decimal CardAmount,
    string? Notes
);

public record PosItemRequest(
    Guid?   ServiceId,
    string  Name,
    decimal UnitPrice,
    int     Quantity
);

public record UpdateCommissionRequest(decimal CommissionRate);

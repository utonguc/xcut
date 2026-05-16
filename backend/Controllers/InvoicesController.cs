using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
public class InvoicesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;

    public InvoicesController(AppDbContext db, IAuditService audit) { _db = db; _audit = audit; }

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    private Guid? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    // ── List ─────────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status = null,
        [FromQuery] Guid? customerId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.Invoices
            .Include(i => i.Customer)
            .Include(i => i.Stylist)
            .Include(i => i.Items)
            .Where(i => i.SalonId == salonId.Value);

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(i => i.Status == status);

        if (customerId.HasValue)
            q = q.Where(i => i.CustomerId == customerId.Value);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(i => i.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            total,
            page,
            pageSize,
            items = items.Select(ToResponse),
        });
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var all = await _db.Invoices
            .Where(i => i.SalonId == salonId.Value)
            .ToListAsync();

        return Ok(new
        {
            totalRevenue    = all.Where(i => i.Status == InvoiceStatuses.Paid).Sum(i => i.Total),
            outstanding     = all.Where(i => i.Status == InvoiceStatuses.Sent || i.Status == InvoiceStatuses.Overdue).Sum(i => i.Total),
            thisMonthTotal  = all.Where(i => i.IssuedAtUtc >= monthStart).Sum(i => i.Total),
            overdueCount    = all.Count(i => i.Status == InvoiceStatuses.Overdue),
        });
    }

    // ── Get one ───────────────────────────────────────────────────────────────

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var inv = await _db.Invoices
            .Include(i => i.Customer)
            .Include(i => i.Stylist)
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == id && i.SalonId == salonId.Value);

        return inv is null ? NotFound() : Ok(ToResponse(inv));
    }

    // ── Create ────────────────────────────────────────────────────────────────

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateInvoiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var no = await GenerateInvoiceNo(salonId.Value);

        var inv = new Invoice
        {
            SalonId     = salonId.Value,
            CustomerId  = req.CustomerId,
            StylistId   = req.StylistId,
            InvoiceNo   = no,
            IssuedAtUtc = req.IssuedAtUtc,
            DueAtUtc    = req.DueAtUtc,
            Currency    = req.Currency,
            TaxRate     = req.TaxRate,
            Notes       = req.Notes?.Trim(),
            Status      = InvoiceStatuses.Draft,
        };

        foreach (var item in req.Items)
        {
            var lineTotal = item.UnitPrice * item.Quantity;
            inv.Items.Add(new InvoiceItem
            {
                Description = item.Description.Trim(),
                Quantity    = item.Quantity,
                UnitPrice   = item.UnitPrice,
                LineTotal   = lineTotal,
            });
        }

        inv.Subtotal  = inv.Items.Sum(i => i.LineTotal);
        inv.TaxAmount = Math.Round(inv.Subtotal * inv.TaxRate / 100, 2);
        inv.Total     = inv.Subtotal + inv.TaxAmount;

        _db.Invoices.Add(inv);
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Invoice", inv.Id.ToString(), "Create", $"Fatura oluşturuldu: {inv.InvoiceNo} — ₺{inv.Total:F2}");
        return Ok(new { inv.Id, inv.InvoiceNo });
    }

    // ── Update ────────────────────────────────────────────────────────────────

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateInvoiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var inv = await _db.Invoices
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == id && i.SalonId == salonId.Value);

        if (inv is null) return NotFound();

        inv.CustomerId  = req.CustomerId;
        inv.StylistId   = req.StylistId;
        inv.IssuedAtUtc = req.IssuedAtUtc;
        inv.DueAtUtc    = req.DueAtUtc;
        inv.Currency    = req.Currency;
        inv.TaxRate     = req.TaxRate;
        inv.Notes       = req.Notes?.Trim();
        inv.UpdatedAtUtc = DateTime.UtcNow;

        _db.InvoiceItems.RemoveRange(inv.Items);
        inv.Items.Clear();

        foreach (var item in req.Items)
        {
            var lineTotal = item.UnitPrice * item.Quantity;
            inv.Items.Add(new InvoiceItem
            {
                InvoiceId   = inv.Id,
                Description = item.Description.Trim(),
                Quantity    = item.Quantity,
                UnitPrice   = item.UnitPrice,
                LineTotal   = lineTotal,
            });
        }

        inv.Subtotal  = inv.Items.Sum(i => i.LineTotal);
        inv.TaxAmount = Math.Round(inv.Subtotal * inv.TaxRate / 100, 2);
        inv.Total     = inv.Subtotal + inv.TaxAmount;

        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Invoice", id.ToString(), "Update", $"Fatura güncellendi: {inv.InvoiceNo} — ₺{inv.Total:F2}");
        return Ok();
    }

    // ── Update status ─────────────────────────────────────────────────────────

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateInvoiceStatusRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var inv = await _db.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.SalonId == salonId.Value);
        if (inv is null) return NotFound();

        inv.Status      = req.Status;
        inv.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Invoice", id.ToString(), "StatusChange", $"Fatura durumu değişti: {inv.InvoiceNo} → {req.Status}");
        return Ok();
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var inv = await _db.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.SalonId == salonId.Value);
        if (inv is null) return NotFound();

        _db.Invoices.Remove(inv);
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Invoice", id.ToString(), "Delete", $"Fatura silindi: {inv.InvoiceNo}");
        return Ok();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<string> GenerateInvoiceNo(Guid salonId)
    {
        var count = await _db.Invoices.CountAsync(i => i.SalonId == salonId);
        return $"INV-{DateTime.UtcNow:yyyy}-{(count + 1):D4}";
    }

    private static InvoiceResponse ToResponse(Invoice i) => new()
    {
        Id           = i.Id,
        InvoiceNo    = i.InvoiceNo,
        CustomerId   = i.CustomerId,
        CustomerName = i.Customer is not null ? $"{i.Customer.FirstName} {i.Customer.LastName}".Trim() : null,
        StylistId    = i.StylistId,
        StylistName  = i.Stylist?.FullName,
        IssuedAtUtc  = i.IssuedAtUtc,
        DueAtUtc     = i.DueAtUtc,
        Status       = i.Status,
        Currency     = i.Currency,
        Subtotal     = i.Subtotal,
        TaxRate      = i.TaxRate,
        TaxAmount    = i.TaxAmount,
        Total        = i.Total,
        Notes        = i.Notes,
        CreatedAtUtc = i.CreatedAtUtc,
        Items        = i.Items.Select(x => new InvoiceItemResponse
        {
            Id          = x.Id,
            Description = x.Description,
            Quantity    = x.Quantity,
            UnitPrice   = x.UnitPrice,
            LineTotal   = x.LineTotal,
        }).ToList(),
    };
}

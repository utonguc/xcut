using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using XCut.Api.Services;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class StockController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    public StockController(AppDbContext db, IAuditService audit) { _db = db; _audit = audit; }

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

    // GET /Stock
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? category = null,
        [FromQuery] string? search   = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.StockItems.Where(x => x.SalonId == salonId.Value).AsQueryable();
        if (!string.IsNullOrWhiteSpace(category)) q = q.Where(x => x.Category == category);
        if (!string.IsNullOrWhiteSpace(search))   q = q.Where(x => x.Name.Contains(search) || (x.Barcode != null && x.Barcode.Contains(search)));

        var now = DateTime.UtcNow;
        var items = await q.OrderBy(x => x.Name)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new StockItemResponse
            {
                Id = x.Id, Name = x.Name, Category = x.Category, Unit = x.Unit,
                Barcode = x.Barcode, Supplier = x.Supplier,
                UnitCost = x.UnitCost, SalePrice = x.SalePrice, StaffBonusPct = x.StaffBonusPct,
                Quantity = x.Quantity, MinQuantity = x.MinQuantity,
                IsLow = x.Quantity <= x.MinQuantity,
                ExpiresAtUtc = x.ExpiresAtUtc,
                IsExpired   = x.ExpiresAtUtc.HasValue && x.ExpiresAtUtc.Value < now,
                ExpiresSoon = x.ExpiresAtUtc.HasValue && x.ExpiresAtUtc.Value >= now && x.ExpiresAtUtc.Value < now.AddDays(30),
                CreatedAtUtc = x.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(items);
    }

    // GET /Stock/summary
    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var now = DateTime.UtcNow;
        var items = await _db.StockItems.Where(x => x.SalonId == salonId.Value).ToListAsync();

        return Ok(new
        {
            totalItems   = items.Count,
            lowStock     = items.Count(x => x.Quantity <= x.MinQuantity),
            expiredItems = items.Count(x => x.ExpiresAtUtc.HasValue && x.ExpiresAtUtc.Value < now),
            expireSoon   = items.Count(x => x.ExpiresAtUtc.HasValue && x.ExpiresAtUtc.Value >= now && x.ExpiresAtUtc.Value < now.AddDays(30)),
            totalValue   = items.Sum(x => x.UnitCost * x.Quantity),
        });
    }

    // GET /Stock/categories
    [HttpGet("categories")]
    public async Task<IActionResult> Categories()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var cats = await _db.StockItems
            .Where(x => x.SalonId == salonId.Value && x.Category != null)
            .Select(x => x.Category!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        return Ok(cats);
    }

    // GET /Stock/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var x = await _db.StockItems.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (x is null) return NotFound();

        var now = DateTime.UtcNow;
        return Ok(new StockItemResponse
        {
            Id = x.Id, Name = x.Name, Category = x.Category, Unit = x.Unit,
            Barcode = x.Barcode, Supplier = x.Supplier,
            UnitCost = x.UnitCost, SalePrice = x.SalePrice, StaffBonusPct = x.StaffBonusPct,
            Quantity = x.Quantity, MinQuantity = x.MinQuantity,
            IsLow = x.Quantity <= x.MinQuantity,
            ExpiresAtUtc = x.ExpiresAtUtc,
            IsExpired   = x.ExpiresAtUtc.HasValue && x.ExpiresAtUtc.Value < now,
            ExpiresSoon = x.ExpiresAtUtc.HasValue && x.ExpiresAtUtc.Value >= now && x.ExpiresAtUtc.Value < now.AddDays(30),
            CreatedAtUtc = x.CreatedAtUtc,
        });
    }

    // GET /Stock/{id}/movements
    [HttpGet("{id:guid}/movements")]
    public async Task<IActionResult> Movements(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!await _db.StockItems.AnyAsync(x => x.Id == id && x.SalonId == salonId.Value))
            return NotFound();

        var movements = await _db.StockMovements
            .Where(m => m.StockItemId == id)
            .OrderByDescending(m => m.CreatedAtUtc)
            .Take(100)
            .Select(m => new StockMovementResponse
            {
                Id = m.Id, Type = m.Type, Quantity = m.Quantity, Note = m.Note,
                UserName = m.User != null ? m.User.FullName : null,
                CreatedAtUtc = m.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(movements);
    }

    // POST /Stock
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStockItemRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Ürün adı zorunludur." });

        var item = new StockItem
        {
            SalonId      = salonId.Value,
            Name         = req.Name.Trim(),
            Category     = req.Category?.Trim(),
            Unit         = req.Unit?.Trim(),
            Barcode      = req.Barcode?.Trim(),
            Supplier     = req.Supplier?.Trim(),
            UnitCost     = req.UnitCost,
            SalePrice    = req.SalePrice,
            StaffBonusPct = req.StaffBonusPct,
            Quantity     = req.Quantity,
            MinQuantity  = req.MinQuantity,
            ExpiresAtUtc = req.ExpiresAtUtc,
        };

        _db.StockItems.Add(item);

        if (req.Quantity > 0)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            _db.StockMovements.Add(new StockMovement
            {
                StockItemId = item.Id,
                Type = "in",
                Quantity = req.Quantity,
                Note = "İlk stok girişi",
                UserId = Guid.TryParse(userId, out var uid) ? uid : null,
            });
        }

        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "StockItem", item.Id.ToString(), "Create", $"Stok ürünü oluşturuldu: {item.Name}");
        return Ok(item.Id);
    }

    // PUT /Stock/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStockItemRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var item = await _db.StockItems.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (item is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Ürün adı zorunludur." });

        item.Name         = req.Name.Trim();
        item.Category     = req.Category?.Trim();
        item.Unit         = req.Unit?.Trim();
        item.Barcode      = req.Barcode?.Trim();
        item.Supplier     = req.Supplier?.Trim();
        item.UnitCost     = req.UnitCost;
        item.SalePrice    = req.SalePrice;
        item.StaffBonusPct = req.StaffBonusPct;
        item.MinQuantity  = req.MinQuantity;
        item.ExpiresAtUtc = req.ExpiresAtUtc;

        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "StockItem", id.ToString(), "Update", $"Stok ürünü güncellendi: {item.Name}");
        return Ok();
    }

    // POST /Stock/{id}/movement
    [HttpPost("{id:guid}/movement")]
    public async Task<IActionResult> AddMovement(Guid id, [FromBody] StockMovementRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var item = await _db.StockItems.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (item is null) return NotFound();

        var delta = req.Type.ToLower() switch
        {
            "in"         => req.Quantity,
            "out"        => -req.Quantity,
            "adjustment" => req.Quantity - item.Quantity,
            _            => req.Quantity,
        };
        item.Quantity = Math.Max(0, item.Quantity + delta);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        _db.StockMovements.Add(new StockMovement
        {
            StockItemId  = id,
            Type         = req.Type,
            Quantity     = req.Quantity,
            Note         = req.Note,
            UserId       = Guid.TryParse(userId, out var uid) ? uid : null,
        });

        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "StockItem", id.ToString(), "StockMovement", $"Stok hareketi: {req.Type} {req.Quantity} {item.Name}");
        return Ok(new { quantity = item.Quantity });
    }

    // DELETE /Stock/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var item = await _db.StockItems.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (item is null) return NotFound();

        _db.StockItems.Remove(item);
        await _db.SaveChangesAsync();
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "StockItem", id.ToString(), "Delete", $"Stok ürünü silindi: {item.Name}");
        return NoContent();
    }

    // GET /Stock/stats — hareket istatistikleri
    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var itemIds = await _db.StockItems
            .Where(x => x.SalonId == salonId.Value)
            .Select(x => x.Id)
            .ToListAsync();

        var totalCounts = await _db.StockMovements
            .Where(m => itemIds.Contains(m.StockItemId))
            .GroupBy(m => m.StockItemId)
            .Select(g => new { Id = g.Key, Total = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Total);

        var monthCounts = await _db.StockMovements
            .Where(m => itemIds.Contains(m.StockItemId) && m.CreatedAtUtc >= monthStart)
            .GroupBy(m => m.StockItemId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        var result = itemIds.Select(id => new
        {
            id                 = id,
            movementsThisMonth = monthCounts.GetValueOrDefault(id, 0),
            movementsTotal     = totalCounts.GetValueOrDefault(id, 0),
        });

        return Ok(result);
    }

    // POST /Stock/bulk-price — toplu fiyat güncelleme
    [HttpPost("bulk-price")]
    public async Task<IActionResult> BulkPrice([FromBody] BulkStockPriceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (req.Amount <= 0) return BadRequest(new { message = "Tutar sıfırdan büyük olmalıdır." });

        var q = _db.StockItems.Where(x => x.SalonId == salonId.Value);
        if (!string.IsNullOrWhiteSpace(req.Category))
            q = q.Where(x => x.Category == req.Category);

        var items = await q.ToListAsync();
        if (items.Count == 0) return BadRequest(new { message = "Güncellenecek ürün bulunamadı." });

        foreach (var item in items)
        {
            if (req.Field == "unitCost")
            {
                item.UnitCost = req.Mode == "percent"
                    ? Math.Round(item.UnitCost * (1 + req.Amount / 100), 2)
                    : Math.Max(0, item.UnitCost + req.Amount);
            }
            else
            {
                item.SalePrice = req.Mode == "percent"
                    ? Math.Round(item.SalePrice * (1 + req.Amount / 100), 2)
                    : Math.Max(0, item.SalePrice + req.Amount);
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { updated = items.Count });
    }
}

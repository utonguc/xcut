using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PackagesController : ControllerBase
{
    private readonly AppDbContext _db;

    public PackagesController(AppDbContext db) => _db = db;

    private Guid? GetSalonId() =>
        Guid.TryParse(User.FindFirstValue("salonId"), out var id) ? id : null;

    // GET /api/Packages
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? activeOnly)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var q = _db.Packages.Where(p => p.SalonId == salonId.Value).AsQueryable();
        if (activeOnly == true) q = q.Where(p => p.IsActive);

        var list = await q
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new {
                p.Id, p.Name, p.Description, p.TotalPrice,
                p.IsActive, p.IsTimeLimited, p.ValidFrom, p.ValidTo, p.CreatedAtUtc,
                Items = _db.PackageItems.Where(i => i.PackageId == p.Id)
                    .Select(i => new { i.Id, i.ItemType, i.ReferenceId, i.ItemName, i.Quantity, i.UnitPrice })
                    .ToList(),
            })
            .ToListAsync();

        return Ok(list);
    }

    // GET /api/Packages/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetOne(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var pkg = await _db.Packages.Where(p => p.Id == id && p.SalonId == salonId.Value)
            .Select(p => new {
                p.Id, p.Name, p.Description, p.TotalPrice,
                p.IsActive, p.IsTimeLimited, p.ValidFrom, p.ValidTo, p.CreatedAtUtc,
                Items = _db.PackageItems.Where(i => i.PackageId == p.Id)
                    .Select(i => new { i.Id, i.ItemType, i.ReferenceId, i.ItemName, i.Quantity, i.UnitPrice })
                    .ToList(),
            })
            .FirstOrDefaultAsync();

        if (pkg is null) return NotFound();
        return Ok(pkg);
    }

    // POST /api/Packages
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPackageRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Paket adı zorunludur." });

        var pkg = new Package
        {
            SalonId       = salonId.Value,
            Name          = req.Name.Trim(),
            Description   = req.Description?.Trim(),
            TotalPrice    = req.TotalPrice,
            IsActive      = req.IsActive,
            IsTimeLimited = req.IsTimeLimited,
            ValidFrom     = req.ValidFrom,
            ValidTo       = req.ValidTo,
        };
        _db.Packages.Add(pkg);
        await _db.SaveChangesAsync();

        foreach (var item in req.Items)
        {
            _db.PackageItems.Add(new PackageItem
            {
                PackageId   = pkg.Id,
                ItemType    = item.ItemType,
                ReferenceId = item.ReferenceId,
                ItemName    = item.ItemName.Trim(),
                Quantity    = item.Quantity > 0 ? item.Quantity : 1,
                UnitPrice   = item.UnitPrice,
            });
        }
        await _db.SaveChangesAsync();

        return Ok(new { pkg.Id, message = "Paket oluşturuldu." });
    }

    // PUT /api/Packages/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertPackageRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var pkg = await _db.Packages.FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);
        if (pkg is null) return NotFound();

        pkg.Name          = req.Name.Trim();
        pkg.Description   = req.Description?.Trim();
        pkg.TotalPrice    = req.TotalPrice;
        pkg.IsActive      = req.IsActive;
        pkg.IsTimeLimited = req.IsTimeLimited;
        pkg.ValidFrom     = req.ValidFrom;
        pkg.ValidTo       = req.ValidTo;

        // Replace all items
        var existing = await _db.PackageItems.Where(i => i.PackageId == id).ToListAsync();
        _db.PackageItems.RemoveRange(existing);
        foreach (var item in req.Items)
        {
            _db.PackageItems.Add(new PackageItem
            {
                PackageId   = pkg.Id,
                ItemType    = item.ItemType,
                ReferenceId = item.ReferenceId,
                ItemName    = item.ItemName.Trim(),
                Quantity    = item.Quantity > 0 ? item.Quantity : 1,
                UnitPrice   = item.UnitPrice,
            });
        }
        await _db.SaveChangesAsync();

        return Ok(new { message = "Güncellendi." });
    }

    // PATCH /api/Packages/{id}/toggle
    [HttpPatch("{id:guid}/toggle")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var pkg = await _db.Packages.FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);
        if (pkg is null) return NotFound();

        pkg.IsActive = !pkg.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { pkg.IsActive });
    }

    // DELETE /api/Packages/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var pkg = await _db.Packages.FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);
        if (pkg is null) return NotFound();

        _db.Packages.Remove(pkg);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi." });
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public class UpsertPackageRequest
{
    public string              Name          { get; set; } = "";
    public string?             Description   { get; set; }
    public decimal             TotalPrice    { get; set; }
    public bool                IsActive      { get; set; } = true;
    public bool                IsTimeLimited { get; set; } = false;
    public DateTime?           ValidFrom     { get; set; }
    public DateTime?           ValidTo       { get; set; }
    public List<PackageItemReq> Items        { get; set; } = new();
}

public class PackageItemReq
{
    public string  ItemType    { get; set; } = "service";
    public Guid?   ReferenceId { get; set; }
    public string  ItemName    { get; set; } = "";
    public int     Quantity    { get; set; } = 1;
    public decimal UnitPrice   { get; set; }
}

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ServicesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ServicesController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    // ── Services ──────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? categoryId = null, [FromQuery] bool activeOnly = true)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        IQueryable<Service> q = _db.Services
            .Include(x => x.ServiceCategory)
            .Where(x => x.SalonId == salonId.Value);
        if (activeOnly) q = q.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(categoryId) && Guid.TryParse(categoryId, out var catGuid))
            q = q.Where(x => x.CategoryId == catGuid);

        var items = await q.OrderBy(x => x.ServiceCategory != null ? x.ServiceCategory.Name : x.Category)
            .ThenBy(x => x.Name).ToListAsync();

        return Ok(items.Select(Map));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Services.Include(x => x.ServiceCategory)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();
        return Ok(Map(s));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateServiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Hizmet adı zorunlu." });

        var service = new Service
        {
            SalonId         = salonId.Value,
            Name            = req.Name.Trim(),
            Description     = req.Description?.Trim(),
            Category        = req.Category?.Trim() ?? "",
            CategoryId      = req.CategoryId,
            DurationMinutes = req.DurationMinutes,
            Price           = req.Price,
            IsActive        = true,
        };

        _db.Services.Add(service);
        await _db.SaveChangesAsync();
        await _db.Entry(service).Reference(x => x.ServiceCategory).LoadAsync();
        return Ok(service.Id);
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateServiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Services.Include(x => x.ServiceCategory)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();

        s.Name            = req.Name.Trim();
        s.Description     = req.Description?.Trim();
        s.Category        = req.Category?.Trim() ?? "";
        s.CategoryId      = req.CategoryId;
        s.DurationMinutes = req.DurationMinutes;
        s.Price           = req.Price;
        s.IsActive        = req.IsActive;
        s.UpdatedAtUtc    = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _db.Entry(s).Reference(x => x.ServiceCategory).LoadAsync();
        return Ok(Map(s));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Patch(Guid id, [FromBody] PatchServiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Services.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();

        if (req.IsActive.HasValue) s.IsActive = req.IsActive.Value;
        s.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Services.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();

        s.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Categories ────────────────────────────────────────────────────

    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var cats = await _db.ServiceCategories.Where(c => c.SalonId == salonId.Value)
            .OrderBy(c => c.Name).ToListAsync();

        var counts = await _db.Services.Where(x => x.SalonId == salonId.Value && x.CategoryId != null)
            .GroupBy(x => x.CategoryId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Id, g => g.Count);

        return Ok(cats.Select(c => new ServiceCategoryResponse
        {
            Id           = c.Id,
            Name         = c.Name,
            Description  = c.Description,
            ServiceCount = counts.GetValueOrDefault(c.Id, 0),
        }));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] ServiceCategoryRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Kategori adı zorunlu." });

        var cat = new ServiceCategory
        {
            SalonId     = salonId.Value,
            Name        = req.Name.Trim(),
            Description = req.Description?.Trim(),
        };
        _db.ServiceCategories.Add(cat);
        await _db.SaveChangesAsync();
        return Ok(new { id = cat.Id });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] ServiceCategoryRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var cat = await _db.ServiceCategories.FirstOrDefaultAsync(c => c.Id == id && c.SalonId == salonId.Value);
        if (cat is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Kategori adı zorunlu." });

        cat.Name        = req.Name.Trim();
        cat.Description = req.Description?.Trim();
        await _db.SaveChangesAsync();
        return Ok();
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var cat = await _db.ServiceCategories.FirstOrDefaultAsync(c => c.Id == id && c.SalonId == salonId.Value);
        if (cat is null) return NotFound();

        _db.ServiceCategories.Remove(cat);
        await _db.SaveChangesAsync();
        return Ok();
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private static ServiceResponse Map(Service s) => new()
    {
        Id              = s.Id,
        Name            = s.Name,
        Description     = s.Description,
        Category        = s.ServiceCategory?.Name ?? s.Category,
        CategoryId      = s.CategoryId,
        CategoryName    = s.ServiceCategory?.Name,
        DurationMinutes = s.DurationMinutes,
        Price           = s.Price,
        IsActive        = s.IsActive,
        CreatedAtUtc    = s.CreatedAtUtc,
        UpdatedAtUtc    = s.UpdatedAtUtc,
    };
}

public class PatchServiceRequest
{
    public bool? IsActive { get; set; }
}

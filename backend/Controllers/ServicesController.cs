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
public class ServicesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;

    public ServicesController(AppDbContext db, IAuditService audit) { _db = db; _audit = audit; }

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
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Service", service.Id.ToString(), "Create", $"Hizmet oluşturuldu: {service.Name}");
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
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Service", id.ToString(), "Update", $"Hizmet güncellendi: {s.Name}");
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
        _ = _audit.LogAsync(salonId.Value, GetUserId(), "Service", id.ToString(), "Delete", $"Hizmet silindi: {s.Name}");
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

    // ── Stats ─────────────────────────────────────────────────────────

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var now       = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var services = await _db.Services
            .Include(x => x.ServiceCategory)
            .Where(x => x.SalonId == salonId.Value)
            .ToListAsync();

        var usageTotal = await _db.Appointments
            .Where(a => a.SalonId == salonId.Value && a.ServiceId != null)
            .GroupBy(a => a.ServiceId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Id, g => g.Count);

        var usageMonth = await _db.Appointments
            .Where(a => a.SalonId == salonId.Value && a.ServiceId != null && a.StartAtUtc >= monthStart)
            .GroupBy(a => a.ServiceId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Id, g => g.Count);

        return Ok(services.Select(s =>
        {
            var r = Map(s);
            r.UsageTotal     = usageTotal.GetValueOrDefault(s.Id, 0);
            r.UsageThisMonth = usageMonth.GetValueOrDefault(s.Id, 0);
            return r;
        }));
    }

    // ── Demo Seed ─────────────────────────────────────────────────────

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("seed-demo")]
    public async Task<IActionResult> SeedDemo()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (await _db.Services.AnyAsync(s => s.SalonId == salonId.Value && s.IsDemo))
            return Conflict(new { message = "Demo veriler zaten yüklü. Önce mevcut demo verileri temizleyin." });

        var catData = new[]
        {
            ("Saç Kesimi",         "Erkek, kadın ve çocuk saç kesimi hizmetleri"),
            ("Saç Boyama & Bakım", "Renklendirme, bakım ve özel saç tedavileri"),
            ("Sakal & Tıraş",      "Klasik ve modern sakal şekillendirme hizmetleri"),
            ("Cilt Bakımı",        "Yüz temizliği ve nemlendirici bakım uygulamaları"),
            ("Tırnak Bakımı",      "Manikür, pedikür ve kalıcı oje hizmetleri"),
        };

        var cats = catData.Select(c => new ServiceCategory
        {
            SalonId     = salonId.Value,
            Name        = c.Item1,
            Description = c.Item2,
        }).ToList();

        _db.ServiceCategories.AddRange(cats);
        await _db.SaveChangesAsync();

        var catMap = cats.ToDictionary(c => c.Name, c => c.Id);

        var services = new List<(string Name, string Desc, string Cat, int Dur, decimal Price)>
        {
            ("Erkek Saç Kesimi",    "Klasik veya modern erkek kesimi",          "Saç Kesimi",         30,  150),
            ("Kadın Saç Kesimi",    "Yıkama dahil kadın saç kesimi",            "Saç Kesimi",         60,  350),
            ("Çocuk Saç Kesimi",    "0–12 yaş çocuk saç kesimi",                "Saç Kesimi",         20,  100),
            ("Saç Yıkama & Föhn",   "Özel şampuan + saç kurutma",               "Saç Kesimi",         30,  200),
            ("Saç Röfinaj",         "Uç alma ve şekillendirme",                 "Saç Kesimi",         45,  250),
            ("Kök Boyama",          "Sadece yeni çıkan köklerin boyanması",     "Saç Boyama & Bakım", 90,  600),
            ("Tam Boya",            "Tüm saçın tek renk boyanması",             "Saç Boyama & Bakım", 120, 900),
            ("Ombre / Balyaj",      "Doğal geçişli balyaj tekniği",             "Saç Boyama & Bakım", 150, 1400),
            ("Keratin Bakım",       "Brezilya fönü / keratin düzleştirme",      "Saç Boyama & Bakım", 180, 1800),
            ("Saç Maskesi",         "Yoğun nemlendirici saç maskesi uygulaması","Saç Boyama & Bakım", 30,  300),
            ("Protein Bakımı",      "Kırık uç onarımı ve parlaklık bakımı",     "Saç Boyama & Bakım", 60,  500),
            ("Sakal Düzeltme",      "Sakal şekillendirme ve düzeltme",          "Sakal & Tıraş",      20,  120),
            ("Klasik Tıraş",        "Jilet ile klasik ıslak tıraş",             "Sakal & Tıraş",      30,  180),
            ("Sakal Boyama",        "Sakal ve bıyık boyama",                    "Sakal & Tıraş",      30,  200),
            ("Hot Towel Tıraş",     "Sıcak havlu ritüelli premium tıraş",       "Sakal & Tıraş",      45,  250),
            ("Yüz Temizliği",       "Derin gözenek temizliği ve peeling",       "Cilt Bakımı",        60,  450),
            ("Nemlendirici Bakım",  "Yoğun nem + maske uygulaması",             "Cilt Bakımı",        45,  350),
            ("Manikür",             "El bakımı, tırnak şekillendirme ve oje",   "Tırnak Bakımı",      45,  250),
            ("Pedikür",             "Ayak bakımı, tırnak şekillendirme ve oje", "Tırnak Bakımı",      60,  300),
            ("Kalıcı Oje",          "Jel kalıcı oje uygulaması",                "Tırnak Bakımı",      30,  200),
        };

        var entities = services.Select(d => new Service
        {
            SalonId         = salonId.Value,
            Name            = d.Name,
            Description     = d.Desc,
            CategoryId      = catMap.GetValueOrDefault(d.Cat),
            Category        = d.Cat,
            DurationMinutes = d.Dur,
            Price           = d.Price,
            IsActive        = true,
            IsDemo          = true,
        }).ToList();

        _db.Services.AddRange(entities);
        await _db.SaveChangesAsync();

        return Ok(new { categoriesAdded = cats.Count, servicesAdded = entities.Count });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("seed-demo")]
    public async Task<IActionResult> ClearDemo()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var demoCatIds = await _db.Services
            .Where(s => s.SalonId == salonId.Value && s.IsDemo && s.CategoryId != null)
            .Select(s => s.CategoryId!.Value)
            .Distinct()
            .ToListAsync();

        var demoServices = await _db.Services
            .Where(s => s.SalonId == salonId.Value && s.IsDemo)
            .ToListAsync();

        _db.Services.RemoveRange(demoServices);
        await _db.SaveChangesAsync();

        var emptyCats = await _db.ServiceCategories
            .Where(c => demoCatIds.Contains(c.Id) && !_db.Services.Any(s => s.CategoryId == c.Id))
            .ToListAsync();

        _db.ServiceCategories.RemoveRange(emptyCats);
        await _db.SaveChangesAsync();

        return Ok(new { servicesDeleted = demoServices.Count, categoriesDeleted = emptyCats.Count });
    }

    // ── Bulk Price Update ─────────────────────────────────────────────

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("bulk-price")]
    public async Task<IActionResult> BulkPrice([FromBody] BulkPriceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        IQueryable<Service> q = _db.Services.Where(s => s.SalonId == salonId.Value && s.IsActive);
        if (req.CategoryId.HasValue)
            q = q.Where(s => s.CategoryId == req.CategoryId.Value);

        var list = await q.ToListAsync();
        foreach (var s in list)
        {
            s.Price = req.Mode == "percent"
                ? Math.Round(s.Price * (1 + req.Amount / 100m), 2)
                : s.Price + req.Amount;
            if (s.Price < 0) s.Price = 0;
            s.UpdatedAtUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
        return Ok(new { updated = list.Count });
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
        IsDemo          = s.IsDemo,
        CreatedAtUtc    = s.CreatedAtUtc,
        UpdatedAtUtc    = s.UpdatedAtUtc,
    };
}

public class BulkPriceRequest
{
    public Guid?   CategoryId { get; set; }
    public string  Mode       { get; set; } = "percent"; // "percent" | "fixed"
    public decimal Amount     { get; set; }
}

public class PatchServiceRequest
{
    public bool? IsActive { get; set; }
}

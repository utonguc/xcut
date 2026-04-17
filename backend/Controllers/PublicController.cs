using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using XCut.Api.Data;

namespace XCut.Api.Controllers;

/// <summary>
/// Public endpoints — kimlik doğrulama gerekmez.
/// Salon dizini ve randevu booking için kullanılır.
/// </summary>
[ApiController]
[Route("api/public")]
public class PublicController : ControllerBase
{
    private readonly AppDbContext _db;
    public PublicController(AppDbContext db) => _db = db;

    // GET api/public/salons?q=&city=&specialty=&page=1&pageSize=12
    [HttpGet("salons")]
    public async Task<IActionResult> GetSalons(
        [FromQuery] string? q,
        [FromQuery] string? city,
        [FromQuery] string? specialty,
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 12)
    {
        pageSize = Math.Clamp(pageSize, 1, 48);
        page     = Math.Max(1, page);

        var query = _db.SalonWebsites
            .Where(w => w.IsPublished && w.ListedInDirectory && w.Salon != null && w.Salon.IsActive)
            .Include(w => w.Salon)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var ql = q.Trim().ToLower();
            query = query.Where(w =>
                w.Salon!.Name.ToLower().Contains(ql) ||
                (w.Address != null && w.Address.ToLower().Contains(ql)) ||
                (w.Salon.City != null && w.Salon.City.ToLower().Contains(ql)));
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            var cl = city.Trim().ToLower();
            query = query.Where(w => w.Salon!.City != null && w.Salon.City.ToLower().Contains(cl));
        }

        var total    = await query.CountAsync();
        var websites = await query
            .OrderByDescending(w => w.Salon!.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var salonIds = websites.Select(w => w.SalonId).ToList();

        var orgSettings = await _db.OrganizationSettings
            .Where(o => salonIds.Contains(o.SalonId))
            .ToDictionaryAsync(o => o.SalonId);

        var stylistSpecialties = await _db.Stylists
            .Where(s => salonIds.Contains(s.SalonId) && s.IsActive && s.Specialty != null)
            .GroupBy(s => s.SalonId)
            .Select(g => new { SalonId = g.Key, Specialties = g.Select(s => s.Specialty!).Distinct().ToList() })
            .ToListAsync();

        var specialtyMap = stylistSpecialties.ToDictionary(x => x.SalonId, x => x.Specialties);

        var results = websites
            .Select(w =>
            {
                var org        = orgSettings.GetValueOrDefault(w.SalonId);
                var specialties = specialtyMap.GetValueOrDefault(w.SalonId, new List<string>());
                if (!string.IsNullOrWhiteSpace(specialty) &&
                    !specialties.Any(s => s.ToLower().Contains(specialty.ToLower())))
                    return null;

                return (object)new
                {
                    salonId       = w.SalonId,
                    name          = w.Salon?.Name,
                    slug          = w.Slug,
                    city          = w.Salon?.City,
                    address       = w.Address,
                    phone         = w.Phone,
                    heroImageUrl  = w.HeroImageUrl,
                    primaryColor  = w.PrimaryColor ?? "#7c3aed",
                    logoUrl       = org?.LogoUrl,
                    specialties,
                };
            })
            .Where(x => x is not null)
            .ToList();

        return Ok(new { total, page, pageSize, items = results });
    }

    // GET api/public/salons/{slug}/book  — randevu booking için stilist + hizmet listesi
    [HttpGet("salons/{slug}/book")]
    public async Task<IActionResult> GetBookingInfo(string slug)
    {
        var w = await _db.SalonWebsites
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Slug == slug && x.IsPublished && x.BookingEnabled);

        if (w is null) return NotFound(new { message = "Salon bulunamadı." });

        var stylists = await _db.Stylists
            .Where(s => s.SalonId == w.SalonId && s.IsActive)
            .OrderBy(s => s.FullName)
            .Select(s => new { s.Id, s.FullName, s.Specialty, s.PhotoUrl })
            .ToListAsync();

        var services = await _db.Services
            .Where(s => s.SalonId == w.SalonId && s.IsActive)
            .OrderBy(s => s.Category).ThenBy(s => s.Name)
            .Select(s => new { s.Id, s.Name, s.Category, s.DurationMinutes, s.Price })
            .ToListAsync();

        return Ok(new
        {
            salonId        = w.SalonId,
            salonName      = w.Salon?.Name,
            phone          = w.Phone,
            whatsAppNumber = w.WhatsAppNumber,
            stylists,
            services,
        });
    }
}

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
public class SalonWebsiteController : ControllerBase
{
    private readonly AppDbContext _db;
    public SalonWebsiteController(AppDbContext db) => _db = db;

    private async Task<(Guid userId, Guid salonId)?> GetCtxAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        return user is null ? null : (user.Id, user.SalonId);
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> Get()
    {
        var ctx = await GetCtxAsync();
        if (ctx is null) return Unauthorized();

        var w = await _db.SalonWebsites.FirstOrDefaultAsync(x => x.SalonId == ctx.Value.salonId);
        if (w is null)
        {
            var salon = await _db.Salons.FirstOrDefaultAsync(x => x.Id == ctx.Value.salonId);
            return Ok(new SalonWebsiteResponse
            {
                Slug           = SlugFrom(salon?.Name ?? "salon"),
                PrimaryColor   = "#7c3aed",
                Theme          = "modern",
                ShowReviews    = true,
                BookingEnabled = true,
            });
        }
        return Ok(MapResponse(w));
    }

    [HttpPut]
    [Authorize]
    public async Task<IActionResult> Save([FromBody] SaveSalonWebsiteRequest req)
    {
        var ctx = await GetCtxAsync();
        if (ctx is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Slug))
            return BadRequest(new { message = "Slug zorunlu." });

        req.Slug = req.Slug.Trim().ToLowerInvariant().Replace(" ", "-");

        var conflict = await _db.SalonWebsites.AnyAsync(x => x.Slug == req.Slug && x.SalonId != ctx.Value.salonId);
        if (conflict)
            return Conflict(new { message = "Bu slug başka bir salon tarafından kullanılıyor." });

        var w = await _db.SalonWebsites.FirstOrDefaultAsync(x => x.SalonId == ctx.Value.salonId);
        if (w is null)
        {
            w = new SalonWebsite { SalonId = ctx.Value.salonId };
            _db.SalonWebsites.Add(w);
        }

        Apply(w, req);
        w.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Web sitesi kaydedildi.", slug = w.Slug });
    }

    [HttpPatch("publish")]
    [Authorize]
    public async Task<IActionResult> TogglePublish()
    {
        var ctx = await GetCtxAsync();
        if (ctx is null) return Unauthorized();

        var w = await _db.SalonWebsites.FirstOrDefaultAsync(x => x.SalonId == ctx.Value.salonId);
        if (w is null) return NotFound(new { message = "Önce web sitesini kaydedin." });

        w.IsPublished = !w.IsPublished;
        await _db.SaveChangesAsync();
        return Ok(new { isPublished = w.IsPublished });
    }

    // Public endpoint — no auth
    [HttpGet("public/{slug}")]
    public async Task<IActionResult> GetPublic(string slug)
    {
        var w = await _db.SalonWebsites
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Slug == slug && x.IsPublished);

        if (w is null) return NotFound(new { message = "Sayfa bulunamadı." });

        var stylists = await _db.Stylists
            .Where(x => x.SalonId == w.SalonId && x.IsActive)
            .OrderBy(x => x.FullName)
            .Select(x => new { x.Id, x.FullName, x.Specialty, x.PhotoUrl, x.Biography })
            .ToListAsync();

        var services = await _db.Services
            .Where(x => x.SalonId == w.SalonId && x.IsActive)
            .OrderBy(x => x.Category).ThenBy(x => x.Name)
            .Select(x => new { x.Id, x.Name, x.Category, x.DurationMinutes, x.Price })
            .ToListAsync();

        return Ok(new { website = MapResponse(w), stylists, services });
    }

    private static string SlugFrom(string name) =>
        System.Text.RegularExpressions.Regex.Replace(
            name.ToLowerInvariant()
                .Replace("ş", "s").Replace("ç", "c").Replace("ğ", "g")
                .Replace("ü", "u").Replace("ö", "o").Replace("ı", "i"),
            @"[^a-z0-9]+", "-").Trim('-');

    private static void Apply(SalonWebsite w, SaveSalonWebsiteRequest r)
    {
        w.Slug           = r.Slug;
        w.CustomDomain   = r.CustomDomain;
        w.HeroTitle      = r.HeroTitle;
        w.HeroSubtitle   = r.HeroSubtitle;
        w.HeroImageUrl   = r.HeroImageUrl;
        w.AboutText      = r.AboutText;
        w.Address        = r.Address;
        w.Phone          = r.Phone;
        w.Email          = r.Email;
        w.GoogleMapsUrl  = r.GoogleMapsUrl;
        w.InstagramUrl   = r.InstagramUrl;
        w.FacebookUrl    = r.FacebookUrl;
        w.WhatsAppNumber = r.WhatsAppNumber;
        w.PrimaryColor   = r.PrimaryColor;
        w.Theme          = r.Theme;
        w.MetaTitle      = r.MetaTitle;
        w.MetaDescription = r.MetaDescription;
        w.ShowReviews    = r.ShowReviews;
        w.BookingEnabled = r.BookingEnabled;
    }

    private static SalonWebsiteResponse MapResponse(SalonWebsite w) => new()
    {
        Id             = w.Id,
        SalonId        = w.SalonId,
        Slug           = w.Slug,
        CustomDomain   = w.CustomDomain,
        HeroTitle      = w.HeroTitle,
        HeroSubtitle   = w.HeroSubtitle,
        HeroImageUrl   = w.HeroImageUrl,
        AboutText      = w.AboutText,
        Address        = w.Address,
        Phone          = w.Phone,
        Email          = w.Email,
        GoogleMapsUrl  = w.GoogleMapsUrl,
        InstagramUrl   = w.InstagramUrl,
        FacebookUrl    = w.FacebookUrl,
        WhatsAppNumber = w.WhatsAppNumber,
        PrimaryColor   = w.PrimaryColor,
        Theme          = w.Theme,
        MetaTitle      = w.MetaTitle,
        MetaDescription = w.MetaDescription,
        ShowReviews    = w.ShowReviews,
        BookingEnabled = w.BookingEnabled,
        IsPublished    = w.IsPublished,
    };
}

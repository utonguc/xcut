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
public class StylistsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public StylistsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db  = db;
        _env = env;
    }

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool activeOnly = false)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.Stylists.Where(x => x.SalonId == salonId.Value);
        if (activeOnly) q = q.Where(x => x.IsActive);

        var items = await q
            .OrderBy(x => x.FullName)
            .Select(x => new StylistResponse
            {
                Id = x.Id, FullName = x.FullName, Specialty = x.Specialty,
                Phone = x.Phone, Email = x.Email, PhotoUrl = x.PhotoUrl,
                Biography = x.Biography, Specializations = x.Specializations,
                ExperienceYears = x.ExperienceYears, IsActive = x.IsActive,
                CreatedAtUtc = x.CreatedAtUtc
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Stylists.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound(new { message = "Stilist bulunamadı." });

        return Ok(Map(s));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStylistRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Ad soyad zorunlu." });

        var stylist = new Stylist
        {
            SalonId         = salonId.Value,
            FullName        = req.FullName.Trim(),
            Specialty       = req.Specialty?.Trim(),
            Phone           = req.Phone?.Trim(),
            Email           = req.Email?.Trim().ToLower(),
            PhotoUrl        = req.PhotoUrl,
            Biography       = req.Biography,
            Specializations = req.Specializations,
            ExperienceYears = req.ExperienceYears,
            IsActive        = true
        };

        _db.Stylists.Add(stylist);
        await _db.SaveChangesAsync();
        return Ok(stylist.Id);
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStylistRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Stylists.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound(new { message = "Stilist bulunamadı." });

        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Ad soyad zorunlu." });

        s.FullName        = req.FullName.Trim();
        s.Specialty       = req.Specialty?.Trim();
        s.Phone           = req.Phone?.Trim();
        s.Email           = req.Email?.Trim().ToLower();
        s.PhotoUrl        = req.PhotoUrl;
        s.Biography       = req.Biography;
        s.Specializations = req.Specializations;
        s.ExperienceYears = req.ExperienceYears;
        s.IsActive        = req.IsActive;

        await _db.SaveChangesAsync();
        return Ok(Map(s));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Stylists.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound(new { message = "Stilist bulunamadı." });

        s.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("{id:guid}/photo")]
    public async Task<IActionResult> UploadPhoto(Guid id, IFormFile file)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Stylists.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowed = new[] { ".jpg", ".jpeg", ".png", ".webp" };
        if (!allowed.Contains(ext)) return BadRequest(new { message = "Yalnızca resim yüklenebilir." });

        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", "stylists");
        Directory.CreateDirectory(uploadsDir);

        var fileName  = $"{id}{ext}";
        var filePath  = Path.Combine(uploadsDir, fileName);

        await using var stream = System.IO.File.Create(filePath);
        await file.CopyToAsync(stream);

        s.PhotoUrl = $"/uploads/stylists/{fileName}";
        await _db.SaveChangesAsync();

        return Ok(new { photoUrl = s.PhotoUrl });
    }

    private static StylistResponse Map(Stylist s) => new()
    {
        Id = s.Id, FullName = s.FullName, Specialty = s.Specialty,
        Phone = s.Phone, Email = s.Email, PhotoUrl = s.PhotoUrl,
        Biography = s.Biography, Specializations = s.Specializations,
        ExperienceYears = s.ExperienceYears, IsActive = s.IsActive,
        CreatedAtUtc = s.CreatedAtUtc
    };
}

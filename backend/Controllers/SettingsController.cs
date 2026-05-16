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
[Authorize(Roles = "SuperAdmin,SalonYonetici")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _environment;

    public SettingsController(AppDbContext db, IWebHostEnvironment environment)
    {
        _db          = db;
        _environment = environment;
    }

    private async Task<User?> GetCurrentUserAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(sub) || !Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
    }

    private Guid GetEffectiveSalonId(User user)
    {
        var claim = User.FindFirstValue("salonId");
        return Guid.TryParse(claim, out var id) ? id : user.SalonId;
    }

    [HttpGet("organization")]
    public async Task<IActionResult> GetOrganization()
    {
        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        var effectiveSalonId = GetEffectiveSalonId(user);
        var salon = await _db.Salons.FindAsync(effectiveSalonId);

        var item = await _db.OrganizationSettings.FirstOrDefaultAsync(x => x.SalonId == effectiveSalonId);
        if (item is null)
        {
            item = new OrganizationSetting { SalonId = effectiveSalonId };
            _db.OrganizationSettings.Add(item);
            await _db.SaveChangesAsync();
        }

        return Ok(new OrganizationSettingsResponse
        {
            Id                 = item.Id,
            SalonId            = item.SalonId,
            CompanyName        = item.CompanyName,
            ApplicationTitle   = item.ApplicationTitle,
            LogoUrl            = item.LogoUrl,
            PrimaryColor       = item.PrimaryColor,
            MfaEnabled         = item.MfaEnabled,
            NotificationConfig = item.NotificationConfig,
            Plan               = salon?.Plan,
            TrialEndsAtUtc     = salon?.TrialEndsAtUtc,
        });
    }

    [HttpPut("organization")]
    public async Task<IActionResult> UpdateOrganization([FromBody] UpdateOrganizationSettingsRequest request)
    {
        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        var item = await _db.OrganizationSettings.FirstOrDefaultAsync(x => x.SalonId == GetEffectiveSalonId(user));
        if (item is null)
        {
            item = new OrganizationSetting { SalonId = GetEffectiveSalonId(user) };
            _db.OrganizationSettings.Add(item);
        }

        item.CompanyName        = string.IsNullOrWhiteSpace(request.CompanyName) ? "Salon" : request.CompanyName;
        item.LogoUrl            = request.LogoUrl;
        item.PrimaryColor       = string.IsNullOrWhiteSpace(request.PrimaryColor) ? "#7c3aed" : request.PrimaryColor;
        item.MfaEnabled         = request.MfaEnabled;
        if (request.NotificationConfig is not null)
            item.NotificationConfig = request.NotificationConfig;
        item.UpdatedAtUtc       = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(item.Id);
    }

    [HttpPost("organization/logo")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> UploadLogo([FromForm] IFormFile file)
    {
        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        if (file is null || file.Length == 0) return BadRequest("Dosya bulunamadı.");

        var ext     = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowed = new[] { ".png", ".jpg", ".jpeg", ".webp", ".svg" };
        if (!allowed.Contains(ext)) return BadRequest("Desteklenmeyen dosya türü.");

        var uploadsRoot = Path.Combine(_environment.ContentRootPath, "uploads", "logos");
        Directory.CreateDirectory(uploadsRoot);

        var fileName = $"{Guid.NewGuid()}{ext}";
        var fullPath = Path.Combine(uploadsRoot, fileName);

        await using (var stream = System.IO.File.Create(fullPath))
            await file.CopyToAsync(stream);

        var url  = $"/uploads/logos/{fileName}";
        var item = await _db.OrganizationSettings.FirstOrDefaultAsync(x => x.SalonId == GetEffectiveSalonId(user));
        if (item is null)
        {
            item = new OrganizationSetting { SalonId = GetEffectiveSalonId(user) };
            _db.OrganizationSettings.Add(item);
        }
        item.LogoUrl      = url;
        item.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { logoUrl = url });
    }

    // GET /api/Settings/users — list salon users (for approver dropdowns etc.)
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        var users = await _db.Users
            .Where(u => u.SalonId == GetEffectiveSalonId(user) && u.IsActive)
            .Include(u => u.Role)
            .OrderBy(u => u.FullName)
            .Select(u => new { u.Id, u.FullName, u.Email, Role = u.Role != null ? u.Role.Name : null })
            .ToListAsync();

        return Ok(users);
    }
}

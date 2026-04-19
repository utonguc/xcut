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
[Route("api/superadmin")]
[Authorize(Roles = "SuperAdmin")]
public class SuperAdminController : ControllerBase
{
    private readonly AppDbContext    _db;
    private readonly ITokenService   _tokenService;

    private static readonly string[] AllModuleCodes =
    [
        "crm","appointments","stylists","services","reports",
        "finance","inventory","assets","tasks",
        "notifications","surveys","whatsapp","website"
    ];

    private static readonly Dictionary<string, string> ModuleLabels = new()
    {
        ["crm"]           = "CRM & Müşteri Yönetimi",
        ["appointments"]  = "Randevu Yönetimi",
        ["stylists"]      = "Stilist Yönetimi",
        ["services"]      = "Hizmet Kataloğu",
        ["reports"]       = "Raporlama",
        ["finance"]       = "Finans & Faturalama",
        ["inventory"]     = "Stok Yönetimi",
        ["assets"]        = "Demirbaş Takibi",
        ["tasks"]         = "Görev Yönetimi",
        ["notifications"] = "Bildirim & SMS/Email",
        ["surveys"]       = "Anket & Memnuniyet",
        ["whatsapp"]      = "WhatsApp Entegrasyonu",
        ["website"]       = "Web Sitesi",
    };

    public SuperAdminController(AppDbContext db, ITokenService tokenService)
    {
        _db           = db;
        _tokenService = tokenService;
    }

    // ── Salon list ────────────────────────────────────────────────────────────

    [HttpGet("salons")]
    public async Task<IActionResult> GetSalons()
    {
        var salons = await _db.Salons.OrderByDescending(x => x.CreatedAtUtc).ToListAsync();
        var result = new List<object>();

        foreach (var s in salons)
        {
            var userCount     = await _db.Users.CountAsync(x => x.SalonId == s.Id);
            var customerCount = await _db.Customers.CountAsync(x => x.SalonId == s.Id);
            var modules       = await _db.ModuleLicenses
                .Where(x => x.SalonId == s.Id && x.IsActive)
                .Select(x => x.ModuleCode)
                .ToListAsync();

            result.Add(new
            {
                id            = s.Id,
                name          = s.Name,
                city          = s.City,
                country       = s.Country,
                emailDomain   = s.EmailDomain,
                isActive      = s.IsActive,
                plan          = s.Plan,
                trialEndsAtUtc = s.TrialEndsAtUtc,
                userCount,
                customerCount,
                activeModules = modules,
                createdAtUtc  = s.CreatedAtUtc,
            });
        }

        return Ok(result);
    }

    // ── Salon create ──────────────────────────────────────────────────────────

    [HttpPost("salons")]
    public async Task<IActionResult> CreateSalon([FromBody] CreateSalonRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Salon adı zorunlu." });
        if (string.IsNullOrWhiteSpace(req.AdminUserName))
            return BadRequest(new { message = "Yönetici kullanıcı adı zorunlu." });
        if (string.IsNullOrWhiteSpace(req.AdminPassword) || req.AdminPassword.Length < 6)
            return BadRequest(new { message = "Şifre en az 6 karakter olmalı." });

        if (await _db.Users.AnyAsync(x => x.UserName == req.AdminUserName))
            return Conflict(new { message = "Bu kullanıcı adı zaten mevcut." });

        var managerRole = await _db.Roles.FirstOrDefaultAsync(x => x.Name == "SalonYonetici");
        if (managerRole is null)
            return StatusCode(500, new { message = "SalonYonetici rolü bulunamadı." });

        var emailDomain = req.EmailDomain?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(emailDomain) &&
            await _db.Salons.AnyAsync(x => x.EmailDomain == emailDomain))
            return Conflict(new { message = "Bu email domain başka bir salona ait." });

        var salon = new Salon
        {
            Name           = req.Name.Trim(),
            City           = req.City?.Trim(),
            Country        = req.Country?.Trim() ?? "Türkiye",
            EmailDomain    = emailDomain,
            IsActive       = true,
            Plan           = req.Plan ?? "trial",
            TrialEndsAtUtc = req.TrialDays.HasValue
                ? DateTime.UtcNow.AddDays(req.TrialDays.Value)
                : DateTime.UtcNow.AddDays(14),
        };
        _db.Salons.Add(salon);
        await _db.SaveChangesAsync();

        var adminUser = new User
        {
            SalonId      = salon.Id,
            FullName     = req.AdminFullName?.Trim() ?? req.AdminUserName,
            UserName     = req.AdminUserName.Trim(),
            Email        = req.AdminEmail?.Trim().ToLower() ?? $"{req.AdminUserName}@xcut.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.AdminPassword),
            IsActive     = true,
            RoleId       = managerRole.Id,
        };
        _db.Users.Add(adminUser);

        foreach (var code in req.Modules ?? AllModuleCodes.ToList())
            _db.ModuleLicenses.Add(new ModuleLicense { SalonId = salon.Id, ModuleCode = code, IsActive = true });

        _db.OrganizationSettings.Add(new OrganizationSetting
        {
            SalonId          = salon.Id,
            CompanyName      = salon.Name,
            ApplicationTitle = salon.Name,
            PrimaryColor     = "#7c3aed",
        });

        await _db.SaveChangesAsync();
        return Ok(new { salonId = salon.Id, message = "Salon oluşturuldu." });
    }

    // ── Salon update (general tab) ────────────────────────────────────────────

    [HttpPut("salons/{id:guid}")]
    public async Task<IActionResult> UpdateSalon(Guid id, [FromBody] UpdateSalonRequest req)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Salon adı zorunlu." });

        var emailDomain = req.EmailDomain?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(emailDomain) &&
            await _db.Salons.AnyAsync(x => x.EmailDomain == emailDomain && x.Id != id))
            return Conflict(new { message = "Bu email domain başka bir salona ait." });

        salon.Name        = req.Name.Trim();
        salon.City        = req.City?.Trim();
        salon.Country     = req.Country?.Trim();
        salon.IsActive    = req.IsActive;
        salon.EmailDomain = string.IsNullOrEmpty(emailDomain) ? null : emailDomain;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Salon güncellendi." });
    }

    // ── Salon toggle active ───────────────────────────────────────────────────

    [HttpPatch("salons/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleSalon(Guid id)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound();
        salon.IsActive = !salon.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { isActive = salon.IsActive });
    }

    // ── Module list for a salon ───────────────────────────────────────────────

    [HttpGet("salons/{id:guid}/modules")]
    public async Task<IActionResult> GetModules(Guid id)
    {
        if (!await _db.Salons.AnyAsync(x => x.Id == id))
            return NotFound();

        var licenses = await _db.ModuleLicenses
            .Where(x => x.SalonId == id)
            .ToDictionaryAsync(x => x.ModuleCode);

        var result = AllModuleCodes.Select(code =>
        {
            licenses.TryGetValue(code, out var lic);
            return new ModuleLicenseResponse
            {
                ModuleCode   = code,
                ModuleLabel  = ModuleLabels.GetValueOrDefault(code, code),
                IsActive     = lic?.IsActive ?? false,
                ExpiresAtUtc = lic?.ExpiresAtUtc,
            };
        });

        return Ok(result);
    }

    // ── Toggle / update a module license ─────────────────────────────────────

    [HttpPut("modules/toggle")]
    public async Task<IActionResult> ToggleModule([FromBody] ToggleModuleRequest req)
    {
        if (!await _db.Salons.AnyAsync(x => x.Id == req.SalonId))
            return NotFound(new { message = "Salon bulunamadı." });

        var lic = await _db.ModuleLicenses
            .FirstOrDefaultAsync(x => x.SalonId == req.SalonId && x.ModuleCode == req.ModuleCode);

        if (lic is null)
        {
            _db.ModuleLicenses.Add(new ModuleLicense
            {
                SalonId      = req.SalonId,
                ModuleCode   = req.ModuleCode,
                IsActive     = req.IsActive,
                ExpiresAtUtc = req.ExpiresAtUtc,
            });
        }
        else
        {
            lic.IsActive     = req.IsActive;
            lic.ExpiresAtUtc = req.ExpiresAtUtc;
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Modül güncellendi." });
    }

    // ── Users of a salon ─────────────────────────────────────────────────────

    [HttpGet("salons/{id:guid}/users")]
    public async Task<IActionResult> GetSalonUsers(Guid id)
    {
        if (!await _db.Salons.AnyAsync(x => x.Id == id))
            return NotFound();

        var users = await _db.Users
            .Include(x => x.Role)
            .Where(x => x.SalonId == id)
            .OrderBy(x => x.FullName)
            .Select(x => new
            {
                id           = x.Id,
                fullName     = x.FullName,
                userName     = x.UserName,
                email        = x.Email,
                isActive     = x.IsActive,
                roleName     = x.Role != null ? x.Role.Name : "",
                createdAtUtc = x.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(users);
    }

    // ── Reset a salon user's password ─────────────────────────────────────────

    [HttpPut("salons/{salonId:guid}/users/{userId:guid}/reset-password")]
    public async Task<IActionResult> ResetUserPassword(Guid salonId, Guid userId, [FromBody] ResetPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest(new { message = "Şifre en az 6 karakter olmalı." });

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId && x.SalonId == salonId);
        if (user is null) return NotFound(new { message = "Kullanıcı bulunamadı." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Şifre güncellendi." });
    }

    // ── Impersonate: get a token scoped to a salon admin ─────────────────────

    [HttpPost("salons/{id:guid}/impersonate")]
    public async Task<IActionResult> Impersonate(Guid id, [FromBody] ImpersonateRequest? req)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound(new { message = "Salon bulunamadı." });
        if (!salon.IsActive) return BadRequest(new { message = "Salon pasif." });

        User? target;
        if (req?.UserId.HasValue == true)
        {
            target = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .FirstOrDefaultAsync(x => x.Id == req.UserId.Value && x.SalonId == id);
        }
        else
        {
            target = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .Where(x => x.SalonId == id && x.IsActive && x.Role != null && x.Role.Name == "SalonYonetici")
                .FirstOrDefaultAsync();
        }

        if (target is null)
            return NotFound(new { message = "Hedef kullanıcı bulunamadı." });

        var token = _tokenService.CreateToken(target);
        return Ok(new
        {
            accessToken = token,
            salonName   = salon.Name,
            userName    = target.UserName,
            fullName    = target.FullName,
            role        = target.Role?.Name,
        });
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        return Ok(new
        {
            totalSalons       = await _db.Salons.CountAsync(),
            activeSalons      = await _db.Salons.CountAsync(x => x.IsActive),
            totalUsers        = await _db.Users.CountAsync(),
            totalCustomers    = await _db.Customers.CountAsync(),
            totalAppointments = await _db.Appointments.CountAsync(),
        });
    }
}

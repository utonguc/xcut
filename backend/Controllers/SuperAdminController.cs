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
[Route("api/superadmin")]
[Authorize(Roles = "SuperAdmin")]
public class SuperAdminController : ControllerBase
{
    private readonly AppDbContext _db;
    public SuperAdminController(AppDbContext db) => _db = db;

    [HttpGet("salons")]
    public async Task<IActionResult> GetSalons()
    {
        var salons = await _db.Salons.OrderByDescending(x => x.CreatedAtUtc).ToListAsync();
        var result = new List<object>();

        foreach (var s in salons)
        {
            var userCount    = await _db.Users.CountAsync(x => x.SalonId == s.Id);
            var customerCount = await _db.Customers.CountAsync(x => x.SalonId == s.Id);
            var modules      = await _db.ModuleLicenses
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
            Name          = req.Name.Trim(),
            City          = req.City?.Trim(),
            Country       = req.Country?.Trim() ?? "Türkiye",
            EmailDomain   = emailDomain,
            IsActive      = true,
            Plan          = req.Plan ?? "trial",
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

        var allModules = new List<string>
        {
            "crm","appointments","stylists","services","reports",
            "finance","inventory","assets","tasks",
            "notifications","surveys","whatsapp","website"
        };
        foreach (var code in req.Modules ?? allModules)
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

    [HttpPatch("salons/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleSalon(Guid id)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound();
        salon.IsActive = !salon.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { isActive = salon.IsActive });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        return Ok(new
        {
            totalSalons     = await _db.Salons.CountAsync(),
            activeSalons    = await _db.Salons.CountAsync(x => x.IsActive),
            totalUsers      = await _db.Users.CountAsync(),
            totalCustomers  = await _db.Customers.CountAsync(),
            totalAppointments = await _db.Appointments.CountAsync(),
        });
    }
}

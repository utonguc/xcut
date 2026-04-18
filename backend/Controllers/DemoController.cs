using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using XCut.Api.Data;
using XCut.Api.Models;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DemoController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<DemoController> _log;

    public DemoController(AppDbContext db, ILogger<DemoController> log)
    {
        _db  = db;
        _log = log;
    }

    // POST api/demo/register
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] DemoRegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.SalonName))
            return BadRequest(new { message = "Salon adı zorunlu." });
        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Ad soyad zorunlu." });
        if (string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@'))
            return BadRequest(new { message = "Geçerli bir e-posta adresi giriniz." });
        if (string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { message = "Telefon numarası zorunlu." });

        if (await _db.Users.AnyAsync(u => u.Email == req.Email.Trim().ToLower()))
            return Conflict(new { message = "Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin." });

        var managerRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "SalonYonetici");
        if (managerRole is null)
            return StatusCode(500, new { message = "Sistem hatası. Lütfen daha sonra tekrar deneyin." });

        var baseUser = req.Email.Split('@')[0]
            .ToLower()
            .Replace(".", "")
            .Replace("-", "")
            .Replace("_", "");
        if (baseUser.Length > 16) baseUser = baseUser[..16];
        var rand4    = new Random().Next(1000, 9999).ToString();
        var userName = $"{baseUser}{rand4}";

        while (await _db.Users.AnyAsync(u => u.UserName == userName))
            userName = $"{baseUser}{new Random().Next(1000, 9999)}";

        var tempPassword = GeneratePassword();

        var salon = new Salon
        {
            Name           = req.SalonName.Trim(),
            City           = req.City?.Trim(),
            Country        = "Türkiye",
            IsActive       = true,
            Plan           = "trial",
            TrialEndsAtUtc = DateTime.UtcNow.AddDays(30),
        };
        _db.Salons.Add(salon);
        await _db.SaveChangesAsync();

        var admin = new User
        {
            SalonId      = salon.Id,
            FullName     = req.FullName.Trim(),
            UserName     = userName,
            Email        = req.Email.Trim().ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword),
            RoleId       = managerRole.Id,
            IsActive     = true,
        };
        _db.Users.Add(admin);

        _db.OrganizationSettings.Add(new OrganizationSetting
        {
            SalonId          = salon.Id,
            CompanyName      = salon.Name,
            ApplicationTitle = "xCut",
            PrimaryColor     = "#7c3aed",
        });

        await _db.SaveChangesAsync();

        _log.LogInformation("Demo kaydı: {SalonName} | {Email} | kullanıcı: {UserName}",
            salon.Name, admin.Email, admin.UserName);

        return Ok(new
        {
            message      = "Demo hesabınız oluşturuldu!",
            userName,
            tempPassword,
            trialEndsAt  = salon.TrialEndsAtUtc!.Value.ToString("dd.MM.yyyy"),
            loginUrl     = "/login",
        });
    }

    private static string GeneratePassword()
    {
        const string upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower  = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        var rng = new Random();
        return new string(new[]
        {
            upper[rng.Next(upper.Length)],
            upper[rng.Next(upper.Length)],
            lower[rng.Next(lower.Length)],
            lower[rng.Next(lower.Length)],
            lower[rng.Next(lower.Length)],
            digits[rng.Next(digits.Length)],
            digits[rng.Next(digits.Length)],
            digits[rng.Next(digits.Length)],
        }.OrderBy(_ => rng.Next()).ToArray());
    }
}

public record DemoRegisterRequest(
    string SalonName,
    string FullName,
    string Email,
    string Phone,
    string? City
);

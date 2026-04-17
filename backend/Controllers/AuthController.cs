// Controllers/AuthController.cs
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
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITokenService _tokenService;
    private readonly IWebHostEnvironment _env;

    public AuthController(AppDbContext db, ITokenService tokenService, IWebHostEnvironment env)
    {
        _db           = db;
        _tokenService = tokenService;
        _env          = env;
    }

    private Guid? GetCurrentUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    // POST api/auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "E-posta ve şifre zorunludur." });

        var email   = request.Email.Trim().ToLowerInvariant();
        var atIndex = email.IndexOf('@');
        if (atIndex < 0)
            return BadRequest(new { message = "Geçerli bir e-posta adresi girin." });

        var domain = email[(atIndex + 1)..];

        var salon = await _db.Salons
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.EmailDomain == domain);

        User? user;

        if (salon is not null)
        {
            user = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .FirstOrDefaultAsync(x => x.SalonId == salon.Id && x.Email == email);
        }
        else
        {
            var matches = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .Where(x => x.Email == email)
                .ToListAsync();

            if (matches.Count > 1)
                return Unauthorized(new {
                    message = "Bu e-posta birden fazla salonda kayıtlı. Lütfen yöneticinizden salon domain'ini tanımlamasını isteyin."
                });

            user = matches.FirstOrDefault();
        }

        if (user is null || !user.IsActive || user.Salon is null || !user.Salon.IsActive)
            return Unauthorized(new { message = "Geçersiz kullanıcı bilgisi." });

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Geçersiz kullanıcı bilgisi." });

        if (user.Salon.TrialEndsAtUtc.HasValue && user.Salon.TrialEndsAtUtc.Value < DateTime.UtcNow)
            return Unauthorized(new { message = "Demo süreniz dolmuştur. Devam etmek için lütfen bizimle iletişime geçin.", trialExpired = true });

        var daysLeft = user.Salon.TrialEndsAtUtc.HasValue
            ? (int)Math.Max(0, (user.Salon.TrialEndsAtUtc.Value - DateTime.UtcNow).TotalDays)
            : (int?)null;

        return Ok(new LoginResponse
        {
            AccessToken   = _tokenService.CreateToken(user),
            ExpiresAtUtc  = _tokenService.GetExpiryUtc(),
            UserName      = user.UserName,
            FullName      = user.FullName,
            Role          = user.Role?.Name,
            TrialDaysLeft = daysLeft,
        });
    }

    // GET api/auth/me
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users
            .Include(x => x.Role)
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (user is null || user.Salon is null) return NotFound();

        var activeModules = await _db.ModuleLicenses
            .Where(x => x.SalonId == user.SalonId && x.IsActive &&
                        (x.ExpiresAtUtc == null || x.ExpiresAtUtc > DateTime.UtcNow))
            .Select(x => x.ModuleCode)
            .ToListAsync();

        return Ok(new MeResponse
        {
            UserId          = user.Id.ToString(),
            SalonId         = user.SalonId.ToString(),
            SalonName       = user.Salon.Name,
            UserName        = user.UserName,
            FullName        = user.FullName,
            Email           = user.Email,
            Role            = user.Role?.Name,
            ActiveModules   = activeModules,
            ProfilePhotoUrl = user.ProfilePhotoUrl,
        });
    }

    // PUT api/auth/profile
    [Authorize]
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.FullName))
            return BadRequest(new { message = "Ad Soyad zorunlu." });

        if (!string.IsNullOrWhiteSpace(request.Email) && request.Email != user.Email)
        {
            var exists = await _db.Users.AnyAsync(x =>
                x.SalonId == user.SalonId && x.Email == request.Email && x.Id != user.Id);
            if (exists) return BadRequest(new { message = "Bu e-posta adresi zaten kullanımda." });
        }

        user.FullName = request.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(request.Email))
            user.Email = request.Email.Trim();

        await _db.SaveChangesAsync();
        return Ok(new { message = "Profil güncellendi." });
    }

    // POST api/auth/photo
    [Authorize]
    [HttpPost("photo")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> UploadPhoto([FromForm] IFormFile file)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return NotFound();

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "Dosya bulunamadı." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!new[] { ".png", ".jpg", ".jpeg", ".webp" }.Contains(ext))
            return BadRequest(new { message = "Desteklenmeyen dosya türü." });

        var dir = Path.Combine(_env.ContentRootPath, "uploads", "users");
        Directory.CreateDirectory(dir);

        var fileName = $"{userId}{ext}";
        await using var stream = System.IO.File.Create(Path.Combine(dir, fileName));
        await file.CopyToAsync(stream);

        user.ProfilePhotoUrl = $"/uploads/users/{fileName}";
        await _db.SaveChangesAsync();

        return Ok(new { profilePhotoUrl = user.ProfilePhotoUrl });
    }

    // POST api/auth/change-password
    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return NotFound("Kullanıcı bulunamadı.");

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Mevcut şifre yanlış." });

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
            return BadRequest(new { message = "Yeni şifre en az 6 karakter olmalı." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Şifre başarıyla değiştirildi." });
    }
}

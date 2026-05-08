using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "SuperAdmin,SalonYonetici")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    public UsersController(AppDbContext db) => _db = db;

    private Guid? GetCurrentUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    private async Task<Guid?> GetSalonIdAsync()
    {
        var uid = GetCurrentUserId();
        if (uid is null) return null;
        return await _db.Users.Where(u => u.Id == uid.Value).Select(u => (Guid?)u.SalonId).FirstOrDefaultAsync();
    }

    // Role metadata lives in UserGroupSeeder.ROLE_META

    // GET /api/Users/roles — roles with metadata
    [HttpGet("roles")]
    public async Task<IActionResult> GetRoles()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var roles = await _db.Roles.OrderBy(r => r.Name).ToListAsync();
        var result = roles
            .Where(r => r.Name != "SuperAdmin")
            .Select(r =>
            {
                UserGroupSeeder.ROLE_META.TryGetValue(r.Name, out var meta);
                return new
                {
                    r.Id,
                    r.Name,
                    DisplayName  = meta.DisplayName ?? r.Name,
                    Description  = meta.Description ?? "",
                    Modules      = meta.Modules ?? Array.Empty<string>(),
                    IsSelfOnly   = meta.IsSelfOnly,
                    Color        = meta.Color ?? "#374151",
                };
            });

        return Ok(result);
    }

    // GET /api/Users — list salon users
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var users = await _db.Users
            .Where(u => u.SalonId == salonId.Value)
            .Include(u => u.Role)
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id, u.FullName, u.UserName, u.Email, u.IsActive,
                RoleId   = (Guid?)u.RoleId,
                RoleName = u.Role != null ? u.Role.Name : null,
                u.ProfilePhotoUrl,
            })
            .ToListAsync();

        return Ok(users);
    }

    // POST /api/Users — create user + auto-create Stylist if Stilist role
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.FullName))    return BadRequest(new { message = "Ad soyad zorunlu." });
        if (string.IsNullOrWhiteSpace(req.Email))        return BadRequest(new { message = "E-posta zorunlu." });
        if (string.IsNullOrWhiteSpace(req.Password))     return BadRequest(new { message = "Şifre zorunlu." });
        if (req.Password.Length < 6)                     return BadRequest(new { message = "Şifre en az 6 karakter olmalı." });

        var email = req.Email.Trim().ToLower();
        if (await _db.Users.AnyAsync(u => u.SalonId == salonId.Value && u.Email == email))
            return Conflict(new { message = "Bu e-posta adresi zaten kullanımda." });

        Role? role = null;
        if (req.RoleId.HasValue)
            role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == req.RoleId.Value);

        // Auto userName from email prefix if not provided
        var userName = string.IsNullOrWhiteSpace(req.UserName)
            ? await GenerateUserName(salonId.Value, email.Split('@')[0])
            : req.UserName.Trim();

        if (await _db.Users.AnyAsync(u => u.SalonId == salonId.Value && u.UserName == userName))
            return Conflict(new { message = "Bu kullanıcı adı zaten kullanımda." });

        var user = new User
        {
            SalonId      = salonId.Value,
            FullName     = req.FullName.Trim(),
            UserName     = userName,
            Email        = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            RoleId       = role?.Id,
            IsActive     = true,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Auto-create Stylist record if role = Stilist
        if (role?.Name == "Stilist")
            await EnsureLinkedStylistAsync(salonId.Value, user.FullName, email, true);

        // Auto-assign built-in permission group for this role
        if (role is not null)
            await UserGroupSeeder.AssignBuiltInGroupAsync(_db, salonId.Value, user.Id, role.Name);

        return Ok(new { user.Id, message = "Kullanıcı oluşturuldu." });
    }

    // PUT /api/Users/{id} — update user
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var user = await _db.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == id && u.SalonId == salonId.Value);
        if (user is null) return NotFound();

        var oldRoleName = user.Role?.Name;

        if (!string.IsNullOrWhiteSpace(req.FullName)) user.FullName = req.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(req.Email))    user.Email    = req.Email.Trim().ToLower();
        if (req.IsActive.HasValue)                     user.IsActive = req.IsActive.Value;

        Role? newRole = null;
        if (req.RoleId.HasValue)
        {
            newRole  = await _db.Roles.FirstOrDefaultAsync(r => r.Id == req.RoleId.Value);
            user.RoleId = newRole?.Id;
        }

        await _db.SaveChangesAsync();
        await _db.Entry(user).ReloadAsync();
        var newRoleName = (await _db.Roles.FirstOrDefaultAsync(r => r.Id == user.RoleId))?.Name;

        // Sync Stylist record when role changes to/from Stilist
        if (oldRoleName != newRoleName)
        {
            if (newRoleName == "Stilist")
                await EnsureLinkedStylistAsync(salonId.Value, user.FullName, user.Email, true);
            else if (oldRoleName == "Stilist")
                await DeactivateLinkedStylistAsync(salonId.Value, user.Email, user.IsActive);

            if (newRoleName is not null)
                await UserGroupSeeder.AssignBuiltInGroupAsync(_db, salonId.Value, user.Id, newRoleName);
        }

        // Sync Stylist active state
        if (req.IsActive.HasValue && newRoleName == "Stilist")
            await DeactivateLinkedStylistAsync(salonId.Value, user.Email, user.IsActive);

        return Ok(new { message = "Kullanıcı güncellendi." });
    }

    // DELETE /api/Users/{id} — deactivate user
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var user = await _db.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == id && u.SalonId == salonId.Value);
        if (user is null) return NotFound();

        user.IsActive = false;
        if (user.Role?.Name == "Stilist")
            await DeactivateLinkedStylistAsync(salonId.Value, user.Email, false);

        await _db.SaveChangesAsync();
        return Ok(new { message = "Kullanıcı devre dışı bırakıldı." });
    }

    // PUT /api/Users/{id}/password — reset password
    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest(new { message = "Şifre en az 6 karakter olmalı." });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && u.SalonId == salonId.Value);
        if (user is null) return NotFound();

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Şifre güncellendi." });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<string> GenerateUserName(Guid salonId, string baseStr)
    {
        var clean = new string(baseStr.Where(c => char.IsLetterOrDigit(c)).ToArray()).ToLower();
        if (clean.Length > 14) clean = clean[..14];
        var candidate = clean;
        var i = 1;
        while (await _db.Users.AnyAsync(u => u.SalonId == salonId && u.UserName == candidate))
            candidate = $"{clean}{i++}";
        return candidate;
    }

    private async Task EnsureLinkedStylistAsync(Guid salonId, string fullName, string email, bool isActive)
    {
        var existing = await _db.Stylists.FirstOrDefaultAsync(s => s.SalonId == salonId &&
            s.Email != null && s.Email.ToLower() == email.ToLower());
        if (existing is null)
        {
            _db.Stylists.Add(new Stylist
            {
                SalonId  = salonId,
                FullName = fullName,
                Email    = email.ToLower(),
                IsActive = isActive,
            });
            await _db.SaveChangesAsync();
        }
        else if (existing.IsActive != isActive)
        {
            existing.IsActive = isActive;
            await _db.SaveChangesAsync();
        }
    }

    private async Task DeactivateLinkedStylistAsync(Guid salonId, string email, bool isActive)
    {
        var s = await _db.Stylists.FirstOrDefaultAsync(x => x.SalonId == salonId &&
            x.Email != null && x.Email.ToLower() == email.ToLower());
        if (s is not null && s.IsActive != isActive)
        {
            s.IsActive = isActive;
            await _db.SaveChangesAsync();
        }
    }

}

// ── DTOs ─────────────────────────────────────────────────────────────────────

public class CreateUserRequest
{
    public string  FullName  { get; set; } = string.Empty;
    public string? UserName  { get; set; }
    public string  Email     { get; set; } = string.Empty;
    public string  Password  { get; set; } = string.Empty;
    public Guid?   RoleId    { get; set; }
}

public class UpdateUserRequest
{
    public string? FullName  { get; set; }
    public string? Email     { get; set; }
    public Guid?   RoleId    { get; set; }
    public bool?   IsActive  { get; set; }
}

public class ResetPasswordRequest
{
    public string NewPassword { get; set; } = string.Empty;
}

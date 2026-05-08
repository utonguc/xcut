using System.Security.Claims;
using System.Text.Json;
using System.IdentityModel.Tokens.Jwt;
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
public class PermissionGroupController : ControllerBase
{
    private readonly AppDbContext _db;

    public PermissionGroupController(AppDbContext db) => _db = db;

    private Guid? GetSalonId()
    {
        var claim = User.FindFirstValue("salonId") ?? User.FindFirstValue("SalonId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static List<string> ParseModules(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }

    private static PermissionGroupResponse ToResponse(PermissionGroup g) => new()
    {
        Id             = g.Id.ToString(),
        Name           = g.Name,
        Description    = g.Description,
        AllowedModules = ParseModules(g.AllowedModules),
        IsSelfOnly     = g.IsSelfOnly,
        IsBuiltIn      = g.IsBuiltIn,
        UserCount      = g.UserGroups.Count,
        Users          = g.UserGroups.Where(ug => ug.User != null).Select(ug => new UserInGroupResponse
        {
            Id       = ug.User!.Id.ToString(),
            FullName = ug.User.FullName,
            Email    = ug.User.Email,
            Role     = ug.User.Role?.Name,
        }).ToList(),
    };

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var groups = await _db.PermissionGroups
            .Where(g => g.SalonId == salonId)
            .Include(g => g.UserGroups).ThenInclude(ug => ug.User).ThenInclude(u => u!.Role)
            .OrderBy(g => g.IsBuiltIn).ThenBy(g => g.Name)
            .ToListAsync();

        return Ok(groups.Select(ToResponse));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePermissionGroupRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.Name)) return BadRequest(new { message = "İsim zorunlu." });

        var group = new PermissionGroup
        {
            SalonId        = salonId.Value,
            Name           = req.Name.Trim(),
            Description    = req.Description?.Trim(),
            AllowedModules = JsonSerializer.Serialize(req.AllowedModules),
            IsSelfOnly     = req.IsSelfOnly,
        };
        _db.PermissionGroups.Add(group);
        await _db.SaveChangesAsync();
        return Ok(new { id = group.Id });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreatePermissionGroupRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var group = await _db.PermissionGroups.FirstOrDefaultAsync(g => g.Id == id && g.SalonId == salonId);
        if (group is null) return NotFound();

        group.Name           = req.Name.Trim();
        group.Description    = req.Description?.Trim();
        group.AllowedModules = JsonSerializer.Serialize(req.AllowedModules);
        group.IsSelfOnly     = req.IsSelfOnly;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var group = await _db.PermissionGroups.FirstOrDefaultAsync(g => g.Id == id && g.SalonId == salonId);
        if (group is null) return NotFound();
        if (group.IsBuiltIn) return BadRequest(new { message = "Yerleşik gruplar silinemez." });

        _db.PermissionGroups.Remove(group);
        await _db.SaveChangesAsync();
        return Ok();
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("{id:guid}/users")]
    public async Task<IActionResult> AssignUser(Guid id, [FromBody] AssignUserToGroupRequest req)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();
        if (!Guid.TryParse(req.UserId, out var userId)) return BadRequest(new { message = "Geçersiz kullanıcı ID." });

        var group = await _db.PermissionGroups.FirstOrDefaultAsync(g => g.Id == id && g.SalonId == salonId);
        if (group is null) return NotFound();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.SalonId == salonId);
        if (user is null) return NotFound(new { message = "Kullanıcı bulunamadı." });

        var exists = await _db.UserPermissionGroups.AnyAsync(x => x.UserId == userId && x.PermissionGroupId == id);
        if (!exists)
        {
            _db.UserPermissionGroups.Add(new UserPermissionGroup { UserId = userId, PermissionGroupId = id });
            await _db.SaveChangesAsync();
        }
        return Ok();
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("{id:guid}/users/{userId:guid}")]
    public async Task<IActionResult> RemoveUser(Guid id, Guid userId)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var entry = await _db.UserPermissionGroups
            .FirstOrDefaultAsync(x => x.PermissionGroupId == id && x.UserId == userId);
        if (entry is null) return NotFound();

        _db.UserPermissionGroups.Remove(entry);
        await _db.SaveChangesAsync();
        return Ok();
    }
}

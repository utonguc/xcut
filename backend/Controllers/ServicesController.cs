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
public class ServicesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ServicesController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? category = null, [FromQuery] bool activeOnly = true)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.Services.Where(x => x.SalonId == salonId.Value);
        if (activeOnly) q = q.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(category)) q = q.Where(x => x.Category == category);

        var items = await q
            .OrderBy(x => x.Category).ThenBy(x => x.Name)
            .Select(x => new ServiceResponse
            {
                Id = x.Id, Name = x.Name, Category = x.Category,
                DurationMinutes = x.DurationMinutes, Price = x.Price,
                IsActive = x.IsActive, CreatedAtUtc = x.CreatedAtUtc
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Services.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();
        return Ok(Map(s));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateServiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Hizmet adı zorunlu." });

        var service = new Service
        {
            SalonId         = salonId.Value,
            Name            = req.Name.Trim(),
            Category        = req.Category?.Trim() ?? "Diğer",
            DurationMinutes = req.DurationMinutes,
            Price           = req.Price,
            IsActive        = true
        };

        _db.Services.Add(service);
        await _db.SaveChangesAsync();
        return Ok(service.Id);
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateServiceRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Services.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();

        s.Name            = req.Name.Trim();
        s.Category        = req.Category?.Trim() ?? "Diğer";
        s.DurationMinutes = req.DurationMinutes;
        s.Price           = req.Price;
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

        var s = await _db.Services.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (s is null) return NotFound();

        s.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ServiceResponse Map(Service s) => new()
    {
        Id = s.Id, Name = s.Name, Category = s.Category,
        DurationMinutes = s.DurationMinutes, Price = s.Price,
        IsActive = s.IsActive, CreatedAtUtc = s.CreatedAtUtc
    };
}

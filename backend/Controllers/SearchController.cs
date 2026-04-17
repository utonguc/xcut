using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SearchController : ControllerBase
{
    private readonly AppDbContext _db;
    public SearchController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    // GET api/search?q=mehmet&limit=5
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int limit = 5)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        q = (q ?? "").Trim();
        if (q.Length < 2)
            return Ok(new { customers = Array.Empty<object>(), stylists = Array.Empty<object>(), appointments = Array.Empty<object>(), tasks = Array.Empty<object>() });

        var customers = await _db.Customers
            .Where(x => x.SalonId == salonId &&
                (EF.Functions.ILike(x.FirstName + " " + x.LastName, $"%{q}%") ||
                 (x.Phone != null && EF.Functions.ILike(x.Phone, $"%{q}%")) ||
                 (x.Email != null && EF.Functions.ILike(x.Email, $"%{q}%"))))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(limit)
            .Select(x => new
            {
                id       = x.Id,
                type     = "customer",
                title    = x.FirstName + " " + x.LastName,
                subtitle = x.Phone ?? x.Email,
                href     = "/customers/" + x.Id,
            })
            .ToListAsync();

        var stylists = await _db.Stylists
            .Where(x => x.SalonId == salonId && x.IsActive &&
                (EF.Functions.ILike(x.FullName, $"%{q}%") ||
                 (x.Specialty != null && EF.Functions.ILike(x.Specialty, $"%{q}%"))))
            .Take(limit)
            .Select(x => new
            {
                id       = x.Id,
                type     = "stylist",
                title    = x.FullName,
                subtitle = x.Specialty,
                href     = "/stylists",
            })
            .ToListAsync();

        var appointments = await _db.Appointments
            .Include(x => x.Customer)
            .Where(x => x.SalonId == salonId &&
                (EF.Functions.ILike(x.ServiceName, $"%{q}%") ||
                 (x.Customer != null && EF.Functions.ILike(x.Customer.FirstName + " " + x.Customer.LastName, $"%{q}%"))))
            .OrderByDescending(x => x.StartAtUtc)
            .Take(limit)
            .Select(x => new
            {
                id       = x.Id,
                type     = "appointment",
                title    = x.ServiceName,
                subtitle = (x.Customer != null ? x.Customer.FirstName + " " + x.Customer.LastName : "")
                           + " · " + x.StartAtUtc.ToString("dd.MM.yyyy HH:mm"),
                href     = "/appointments",
            })
            .ToListAsync();

        var tasks = await _db.Tasks
            .Where(x => x.SalonId == salonId && EF.Functions.ILike(x.Title, $"%{q}%"))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(limit)
            .Select(x => new
            {
                id       = x.Id,
                type     = "task",
                title    = x.Title,
                subtitle = x.Status + (x.Priority != null ? " · " + x.Priority : ""),
                href     = "/tasks",
            })
            .ToListAsync();

        return Ok(new { customers, stylists, appointments, tasks });
    }
}

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
    private sealed record SearchResult(Guid Id, string Type, string Title, string? Subtitle, string Href);

    private readonly AppDbContext _db;
    public SearchController(AppDbContext db) => _db = db;

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // GET api/search?q=mehmet&limit=5
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int limit = 5)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        q = (q ?? "").Trim();
        if (q.Length < 2)
            return Ok(Array.Empty<SearchResult>());

        var n = Math.Max(2, limit);

        // ── Customers ──────────────────────────────────────────────
        var rawCustomers = await _db.Customers
            .Where(x => x.SalonId == salonId &&
                (EF.Functions.ILike(x.FirstName + " " + x.LastName, $"%{q}%") ||
                 (x.Phone != null && EF.Functions.ILike(x.Phone, $"%{q}%")) ||
                 (x.Email != null && EF.Functions.ILike(x.Email, $"%{q}%"))))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(n)
            .Select(x => new { x.Id, Name = x.FirstName + " " + x.LastName, x.Phone, x.Email })
            .ToListAsync();

        var customers = rawCustomers.Select(x =>
            new SearchResult(x.Id, "customer", x.Name, x.Phone ?? x.Email, $"/customers/{x.Id}"));

        // ── Stylists ───────────────────────────────────────────────
        var rawStylists = await _db.Stylists
            .Where(x => x.SalonId == salonId && x.IsActive &&
                (EF.Functions.ILike(x.FullName, $"%{q}%") ||
                 (x.Specialty != null && EF.Functions.ILike(x.Specialty, $"%{q}%"))))
            .Take(n)
            .Select(x => new { x.Id, x.FullName, x.Specialty })
            .ToListAsync();

        var stylists = rawStylists.Select(x =>
            new SearchResult(x.Id, "stylist", x.FullName, x.Specialty, "/stylists"));

        // ── Appointments ───────────────────────────────────────────
        var rawAppts = await _db.Appointments
            .Where(x => x.SalonId == salonId &&
                (EF.Functions.ILike(x.ServiceName, $"%{q}%") ||
                 (x.Customer != null && EF.Functions.ILike(x.Customer.FirstName + " " + x.Customer.LastName, $"%{q}%"))))
            .OrderByDescending(x => x.StartAtUtc)
            .Take(n)
            .Select(x => new
            {
                x.Id, x.ServiceName,
                CustomerName = x.Customer != null ? x.Customer.FirstName + " " + x.Customer.LastName : "",
                x.StartAtUtc,
            })
            .ToListAsync();

        var appointments = rawAppts.Select(x =>
            new SearchResult(x.Id, "appointment", x.ServiceName,
                $"{x.CustomerName} · {x.StartAtUtc:dd.MM.yyyy HH:mm}", "/appointments"));

        // ── Tasks ──────────────────────────────────────────────────
        var rawTasks = await _db.Tasks
            .Where(x => x.SalonId == salonId && EF.Functions.ILike(x.Title, $"%{q}%"))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(n)
            .Select(x => new { x.Id, x.Title, x.Status, x.Priority })
            .ToListAsync();

        var tasks = rawTasks.Select(x =>
            new SearchResult(x.Id, "task", x.Title,
                x.Status + (x.Priority != null ? $" · {x.Priority}" : ""), "/tasks"));

        // ── Services ───────────────────────────────────────────────
        var rawServices = await _db.Services
            .Where(x => x.SalonId == salonId && x.IsActive &&
                (EF.Functions.ILike(x.Name, $"%{q}%") ||
                 EF.Functions.ILike(x.Category, $"%{q}%") ||
                 (x.Description != null && EF.Functions.ILike(x.Description, $"%{q}%"))))
            .Take(n)
            .Select(x => new { x.Id, x.Name, x.Category, x.DurationMinutes, x.Price })
            .ToListAsync();

        var services = rawServices.Select(x =>
            new SearchResult(x.Id, "service", x.Name,
                $"{x.Category} · {x.DurationMinutes} dk · {x.Price:N2} ₺", "/services"));

        // ── Stock ──────────────────────────────────────────────────
        var rawStocks = await _db.StockItems
            .Where(x => x.SalonId == salonId &&
                (EF.Functions.ILike(x.Name, $"%{q}%") ||
                 (x.Category != null && EF.Functions.ILike(x.Category, $"%{q}%")) ||
                 (x.Barcode != null && EF.Functions.ILike(x.Barcode, $"%{q}%"))))
            .Take(n)
            .Select(x => new { x.Id, x.Name, x.Category, x.Quantity })
            .ToListAsync();

        var stocks = rawStocks.Select(x =>
            new SearchResult(x.Id, "stock", x.Name,
                $"{(x.Category is not null ? x.Category + " · " : "")}{x.Quantity} adet", "/stock"));

        var all = customers
            .Concat(stylists)
            .Concat(appointments)
            .Concat(tasks)
            .Concat(services)
            .Concat(stocks)
            .ToList();

        return Ok(all);
    }
}

using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AuditLogController : ControllerBase
{
    private readonly AppDbContext _db;

    public AuditLogController(AppDbContext db) => _db = db;

    private Guid? GetSalonId()
    {
        var claim = User.FindFirstValue("salonId") ?? User.FindFirstValue("SalonId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? entityType,
        [FromQuery] string? action,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? userId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var q = _db.AuditLogs
            .Include(l => l.User)
            .Where(l => l.SalonId == salonId);

        if (!string.IsNullOrWhiteSpace(entityType))
            q = q.Where(l => l.EntityType == entityType);
        if (!string.IsNullOrWhiteSpace(action))
            q = q.Where(l => l.Action == action);
        if (from.HasValue)
            q = q.Where(l => l.CreatedAtUtc >= from.Value.ToUniversalTime());
        if (to.HasValue)
            q = q.Where(l => l.CreatedAtUtc <= to.Value.ToUniversalTime().AddDays(1));
        if (!string.IsNullOrWhiteSpace(userId) && Guid.TryParse(userId, out var uid))
            q = q.Where(l => l.UserId == uid);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(l => l.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new AuditLogListItem
            {
                Id           = l.Id.ToString(),
                UserName     = l.User != null ? l.User.FullName : null,
                EntityType   = l.EntityType,
                EntityId     = l.EntityId,
                Action       = l.Action,
                Description  = l.Description,
                IpAddress    = l.IpAddress,
                CreatedAtUtc = l.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(new PagedResult<AuditLogListItem>
        {
            Items    = items,
            Total    = total,
            Page     = page,
            PageSize = pageSize,
        });
    }

    [HttpGet("entity-types")]
    public async Task<IActionResult> EntityTypes()
    {
        var salonId = GetSalonId();
        if (salonId is null) return Unauthorized();

        var types = await _db.AuditLogs
            .Where(l => l.SalonId == salonId)
            .Select(l => l.EntityType)
            .Distinct()
            .OrderBy(t => t)
            .ToListAsync();

        return Ok(types);
    }
}

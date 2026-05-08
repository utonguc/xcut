using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using XCut.Api.Data;
using XCut.Api.Models;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ColorFormulaController : ControllerBase
{
    private readonly AppDbContext _db;
    public ColorFormulaController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    // GET api/ColorFormula?customerId=
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? customerId)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.ColorFormulas
            .Where(c => c.SalonId == salonId.Value)
            .Include(c => c.Customer)
            .Include(c => c.Stylist)
            .AsQueryable();

        if (customerId.HasValue) q = q.Where(c => c.CustomerId == customerId.Value);

        var items = await q.OrderByDescending(c => c.CreatedAtUtc)
            .Select(c => new
            {
                c.Id, c.CustomerId, c.StylistId, c.FormulaName,
                c.Brand, c.ColorsJson, c.Developer, c.DeveloperVolume,
                c.ProcessMinutes, c.Notes, c.CreatedAtUtc, c.UpdatedAtUtc,
                customerName = c.Customer != null ? $"{c.Customer.FirstName} {c.Customer.LastName}".Trim() : null,
                stylistName  = c.Stylist  != null ? c.Stylist.FullName : null,
            })
            .ToListAsync();

        return Ok(items);
    }

    // GET api/ColorFormula/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetOne(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var c = await _db.ColorFormulas
            .Include(x => x.Customer)
            .Include(x => x.Stylist)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);

        if (c is null) return NotFound();

        return Ok(new
        {
            c.Id, c.CustomerId, c.StylistId, c.FormulaName,
            c.Brand, c.ColorsJson, c.Developer, c.DeveloperVolume,
            c.ProcessMinutes, c.Notes, c.CreatedAtUtc, c.UpdatedAtUtc,
            customerName = c.Customer != null ? $"{c.Customer.FirstName} {c.Customer.LastName}".Trim() : null,
            stylistName  = c.Stylist  != null ? c.Stylist.FullName : null,
        });
    }

    // POST api/ColorFormula
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ColorFormulaRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var formula = new ColorFormula
        {
            SalonId         = salonId.Value,
            CustomerId      = req.CustomerId,
            StylistId       = req.StylistId,
            FormulaName     = req.FormulaName.Trim(),
            Brand           = req.Brand?.Trim(),
            ColorsJson      = req.ColorsJson,
            Developer       = req.Developer?.Trim(),
            DeveloperVolume = req.DeveloperVolume,
            ProcessMinutes  = req.ProcessMinutes,
            Notes           = req.Notes?.Trim(),
        };

        _db.ColorFormulas.Add(formula);
        await _db.SaveChangesAsync();
        return Ok(new { formula.Id, formula.FormulaName, formula.CreatedAtUtc });
    }

    // PUT api/ColorFormula/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] ColorFormulaRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var formula = await _db.ColorFormulas
            .FirstOrDefaultAsync(c => c.Id == id && c.SalonId == salonId.Value);
        if (formula is null) return NotFound();

        formula.StylistId       = req.StylistId;
        formula.FormulaName     = req.FormulaName.Trim();
        formula.Brand           = req.Brand?.Trim();
        formula.ColorsJson      = req.ColorsJson;
        formula.Developer       = req.Developer?.Trim();
        formula.DeveloperVolume = req.DeveloperVolume;
        formula.ProcessMinutes  = req.ProcessMinutes;
        formula.Notes           = req.Notes?.Trim();
        formula.UpdatedAtUtc    = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { formula.Id, formula.UpdatedAtUtc });
    }

    // DELETE api/ColorFormula/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var formula = await _db.ColorFormulas
            .FirstOrDefaultAsync(c => c.Id == id && c.SalonId == salonId.Value);
        if (formula is null) return NotFound();

        _db.ColorFormulas.Remove(formula);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record ColorFormulaRequest(
    Guid    CustomerId,
    Guid?   StylistId,
    string  FormulaName,
    string? Brand,
    string? ColorsJson,
    string? Developer,
    string? DeveloperVolume,
    int?    ProcessMinutes,
    string? Notes
);

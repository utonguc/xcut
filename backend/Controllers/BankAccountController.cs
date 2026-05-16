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
public class BankAccountController : ControllerBase
{
    private readonly AppDbContext _db;
    public BankAccountController(AppDbContext db) => _db = db;

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var items = await _db.BankAccounts
            .Where(b => b.SalonId == salonId.Value)
            .OrderBy(b => b.BankName)
            .Select(b => new { b.Id, b.BankName, b.AccountName, b.IBAN, b.IsActive, b.CreatedAtUtc })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BankAccountRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var bank = new BankAccount
        {
            SalonId     = salonId.Value,
            BankName    = req.BankName.Trim(),
            AccountName = req.AccountName.Trim(),
            IBAN        = req.IBAN?.Trim().ToUpperInvariant(),
        };
        _db.BankAccounts.Add(bank);
        await _db.SaveChangesAsync();
        return Ok(new { bank.Id, bank.BankName, bank.AccountName, bank.IBAN });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] BankAccountRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var bank = await _db.BankAccounts.FirstOrDefaultAsync(b => b.Id == id && b.SalonId == salonId.Value);
        if (bank is null) return NotFound();

        bank.BankName    = req.BankName.Trim();
        bank.AccountName = req.AccountName.Trim();
        bank.IBAN        = req.IBAN?.Trim().ToUpperInvariant();
        bank.IsActive    = req.IsActive ?? bank.IsActive;

        await _db.SaveChangesAsync();
        return Ok(new { bank.Id, bank.BankName, bank.AccountName, bank.IBAN, bank.IsActive });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var bank = await _db.BankAccounts.FirstOrDefaultAsync(b => b.Id == id && b.SalonId == salonId.Value);
        if (bank is null) return NotFound();

        bank.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record BankAccountRequest(string BankName, string AccountName, string? IBAN, bool? IsActive);

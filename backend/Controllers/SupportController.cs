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
public class SupportController : ControllerBase
{
    private readonly AppDbContext _db;
    public SupportController(AppDbContext db) => _db = db;

    private async Task<User?> GetCurrentUserAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
               ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Id == userId);
    }

    // GET api/Support/my — all tickets for this salon with messages
    [HttpGet("my")]
    public async Task<IActionResult> GetMyTickets()
    {
        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        var tickets = await _db.SupportTickets
            .Include(x => x.Messages)
            .Where(x => x.SalonId == user.SalonId)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .ToListAsync();

        return Ok(tickets.Select(ToDetailResponse));
    }

    // POST api/Support — create new ticket + first message
    [HttpPost]
    public async Task<IActionResult> CreateTicket([FromBody] CreateTicketRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Subject))
            return BadRequest(new { message = "Konu boş olamaz." });
        if (string.IsNullOrWhiteSpace(req.Body))
            return BadRequest(new { message = "Mesaj boş olamaz." });

        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        var now = DateTime.UtcNow;

        var ticket = new SupportTicket
        {
            Id           = Guid.NewGuid(),
            SalonId      = user.SalonId,
            UserId       = user.Id,
            UserName     = user.FullName,
            SalonName    = user.Salon?.Name ?? string.Empty,
            Subject      = req.Subject.Trim(),
            PageContext  = req.PageContext,
            Status       = "Open",
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
        _db.SupportTickets.Add(ticket);
        await _db.SaveChangesAsync();

        var firstMessage = new SupportMessage
        {
            Id           = Guid.NewGuid(),
            TicketId     = ticket.Id,
            Body         = req.Body,
            IsFromAdmin  = false,
            AuthorName   = user.FullName,
            CreatedAtUtc = now,
        };
        _db.SupportMessages.Add(firstMessage);
        await _db.SaveChangesAsync();

        // Reload with messages
        var created = await _db.SupportTickets
            .Include(x => x.Messages)
            .FirstAsync(x => x.Id == ticket.Id);

        return Ok(ToDetailResponse(created));
    }

    // POST api/Support/{id}/messages — add a message to an existing ticket
    [HttpPost("{id:guid}/messages")]
    public async Task<IActionResult> AddMessage(Guid id, [FromBody] AddMessageRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Body))
            return BadRequest(new { message = "Mesaj boş olamaz." });

        var user = await GetCurrentUserAsync();
        if (user is null) return Unauthorized();

        var ticket = await _db.SupportTickets
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == user.SalonId);
        if (ticket is null) return NotFound();

        var msg = new SupportMessage
        {
            Id           = Guid.NewGuid(),
            TicketId     = ticket.Id,
            Body         = req.Body,
            IsFromAdmin  = false,
            AuthorName   = user.FullName,
            CreatedAtUtc = DateTime.UtcNow,
        };
        _db.SupportMessages.Add(msg);
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new SupportMessageDto(
            msg.Id, msg.Body, msg.IsFromAdmin, msg.AuthorName, msg.CreatedAtUtc));
    }

    private static SupportTicketDetailResponse ToDetailResponse(SupportTicket t) =>
        new(t.Id, t.SalonId, t.SalonName, t.UserName,
            t.Subject, t.PageContext, t.Status,
            t.CreatedAtUtc, t.UpdatedAtUtc,
            t.Messages.Count,
            t.Messages.OrderBy(m => m.CreatedAtUtc)
                .Select(m => new SupportMessageDto(
                    m.Id, m.Body, m.IsFromAdmin, m.AuthorName, m.CreatedAtUtc))
                .ToList());
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using XCut.Api.Services;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EmailController : ControllerBase
{
    private readonly IEmailService _email;

    public EmailController(IEmailService email) => _email = email;

    public record SendRequest(string To, string Subject, string Html);

    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.To) || string.IsNullOrWhiteSpace(req.Subject))
            return BadRequest(new { message = "Alıcı ve konu zorunludur." });

        await _email.SendAsync(req.To, req.Subject, req.Html ?? "");
        return Ok(new { ok = true });
    }
}

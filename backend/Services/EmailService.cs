using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace XCut.Api.Services;

public interface IEmailService
{
    Task SendAsync(string to, string subject, string htmlBody);
    Task SendAsync(IEnumerable<string> recipients, string subject, string htmlBody);
}

public class SmtpSettings
{
    public string Host        { get; set; } = string.Empty;
    public int    Port        { get; set; } = 587;
    public bool   UseSsl      { get; set; } = true;
    public string UserName    { get; set; } = string.Empty;
    public string Password    { get; set; } = string.Empty;
    public string FromName    { get; set; } = "xCut";
    public string FromAddress { get; set; } = string.Empty;
}

public class SmtpEmailService : IEmailService
{
    private readonly SmtpSettings _cfg;
    private readonly ILogger<SmtpEmailService> _log;

    public SmtpEmailService(IOptions<SmtpSettings> cfg, ILogger<SmtpEmailService> log)
    {
        _cfg = cfg.Value;
        _log = log;
    }

    public Task SendAsync(string to, string subject, string htmlBody)
        => SendAsync(new[] { to }, subject, htmlBody);

    public async Task SendAsync(IEnumerable<string> recipients, string subject, string htmlBody)
    {
        var toList = recipients.Where(r => !string.IsNullOrWhiteSpace(r)).ToList();
        if (toList.Count == 0) return;

        if (string.IsNullOrWhiteSpace(_cfg.Host) || string.IsNullOrWhiteSpace(_cfg.FromAddress))
        {
            _log.LogInformation("[EMAIL MOCK] Subject: {Subject} → {Tos}", subject, string.Join(", ", toList));
            return;
        }

        try
        {
            using var client = new SmtpClient(_cfg.Host, _cfg.Port)
            {
                EnableSsl   = _cfg.UseSsl,
                Credentials = new NetworkCredential(_cfg.UserName, _cfg.Password),
            };

            var from = new MailAddress(_cfg.FromAddress, _cfg.FromName);
            using var msg = new MailMessage { From = from, Subject = subject, IsBodyHtml = true, Body = htmlBody };
            foreach (var to in toList) msg.To.Add(to);

            await client.SendMailAsync(msg);
            _log.LogInformation("[EMAIL] Sent '{Subject}' to {Count} recipient(s).", subject, toList.Count);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "[EMAIL] Failed to send '{Subject}'.", subject);
        }
    }
}

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/superadmin")]
[Authorize(Roles = "SuperAdmin")]
public class SuperAdminController : ControllerBase
{
    private readonly AppDbContext    _db;
    private readonly ITokenService   _tokenService;

    private static readonly string[] AllModuleCodes =
    [
        "appointments","customers","staff","services","stock",
        "tasks","kasa","finance","reports","whatsapp",
        "audit","website","crm","settings"
    ];

    private static readonly Dictionary<string, string> ModuleLabels = new()
    {
        ["appointments"] = "Randevu Yönetimi",
        ["customers"]    = "Müşteri Yönetimi",
        ["staff"]        = "Personel & Stilistler",
        ["services"]     = "Hizmet Kataloğu",
        ["stock"]        = "Stok Yönetimi",
        ["tasks"]        = "Görev Yönetimi",
        ["kasa"]         = "Kasa & POS",
        ["finance"]      = "Finans & Faturalama",
        ["reports"]      = "Raporlama",
        ["whatsapp"]     = "WhatsApp Entegrasyonu",
        ["audit"]        = "Denetim Logu",
        ["website"]      = "Web Sitesi",
        ["crm"]          = "CRM & Toplu İletişim",
        ["settings"]     = "Ayarlar",
    };

    public SuperAdminController(AppDbContext db, ITokenService tokenService)
    {
        _db           = db;
        _tokenService = tokenService;
    }

    // ── Salon list ────────────────────────────────────────────────────────────

    [HttpGet("salons")]
    public async Task<IActionResult> GetSalons()
    {
        var salons = await _db.Salons.OrderByDescending(x => x.CreatedAtUtc).ToListAsync();
        var result = new List<object>();

        foreach (var s in salons)
        {
            var userCount     = await _db.Users.CountAsync(x => x.SalonId == s.Id);
            var customerCount = await _db.Customers.CountAsync(x => x.SalonId == s.Id);
            var modules       = await _db.ModuleLicenses
                .Where(x => x.SalonId == s.Id && x.IsActive)
                .Select(x => x.ModuleCode)
                .ToListAsync();

            result.Add(new
            {
                id             = s.Id,
                name           = s.Name,
                city           = s.City,
                country        = s.Country,
                emailDomain    = s.EmailDomain,
                isActive       = s.IsActive,
                plan           = s.Plan,
                trialEndsAtUtc = s.TrialEndsAtUtc,
                saNote         = s.SaNote,
                userCount,
                customerCount,
                activeModules  = modules,
                createdAtUtc   = s.CreatedAtUtc,
            });
        }

        return Ok(result);
    }

    // ── Salon create ──────────────────────────────────────────────────────────

    [HttpPost("salons")]
    public async Task<IActionResult> CreateSalon([FromBody] CreateSalonRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Salon adı zorunlu." });
        if (string.IsNullOrWhiteSpace(req.AdminUserName))
            return BadRequest(new { message = "Yönetici kullanıcı adı zorunlu." });
        if (string.IsNullOrWhiteSpace(req.AdminPassword) || req.AdminPassword.Length < 6)
            return BadRequest(new { message = "Şifre en az 6 karakter olmalı." });

        if (await _db.Users.AnyAsync(x => x.UserName == req.AdminUserName))
            return Conflict(new { message = "Bu kullanıcı adı zaten mevcut." });

        var managerRole = await _db.Roles.FirstOrDefaultAsync(x => x.Name == "SalonYonetici");
        if (managerRole is null)
            return StatusCode(500, new { message = "SalonYonetici rolü bulunamadı." });

        var emailDomain = req.EmailDomain?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(emailDomain) &&
            await _db.Salons.AnyAsync(x => x.EmailDomain == emailDomain))
            return Conflict(new { message = "Bu email domain başka bir salona ait." });

        var salon = new Salon
        {
            Name           = req.Name.Trim(),
            City           = req.City?.Trim(),
            Country        = req.Country?.Trim() ?? "Türkiye",
            EmailDomain    = emailDomain,
            IsActive       = true,
            Plan           = req.Plan ?? "trial",
            TrialEndsAtUtc = req.TrialDays.HasValue
                ? DateTime.UtcNow.AddDays(req.TrialDays.Value)
                : DateTime.UtcNow.AddDays(14),
        };
        _db.Salons.Add(salon);
        await _db.SaveChangesAsync();

        var adminUser = new User
        {
            SalonId      = salon.Id,
            FullName     = req.AdminFullName?.Trim() ?? req.AdminUserName,
            UserName     = req.AdminUserName.Trim(),
            Email        = req.AdminEmail?.Trim().ToLower() ?? $"{req.AdminUserName}@xcut.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.AdminPassword),
            IsActive     = true,
            RoleId       = managerRole.Id,
        };
        _db.Users.Add(adminUser);

        foreach (var code in req.Modules ?? AllModuleCodes.ToList())
            _db.ModuleLicenses.Add(new ModuleLicense { SalonId = salon.Id, ModuleCode = code, IsActive = true });

        _db.OrganizationSettings.Add(new OrganizationSetting
        {
            SalonId          = salon.Id,
            CompanyName      = salon.Name,
            ApplicationTitle = salon.Name,
            PrimaryColor     = "#7c3aed",
        });

        await _db.SaveChangesAsync();
        return Ok(new { salonId = salon.Id, message = "Salon oluşturuldu." });
    }

    // ── Salon update (general tab) ────────────────────────────────────────────

    [HttpPut("salons/{id:guid}")]
    public async Task<IActionResult> UpdateSalon(Guid id, [FromBody] UpdateSalonRequest req)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Salon adı zorunlu." });

        var emailDomain = req.EmailDomain?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(emailDomain) &&
            await _db.Salons.AnyAsync(x => x.EmailDomain == emailDomain && x.Id != id))
            return Conflict(new { message = "Bu email domain başka bir salona ait." });

        salon.Name           = req.Name.Trim();
        salon.City           = req.City?.Trim();
        salon.Country        = req.Country?.Trim();
        salon.IsActive       = req.IsActive;
        salon.EmailDomain    = string.IsNullOrEmpty(emailDomain) ? null : emailDomain;
        salon.Plan           = string.IsNullOrWhiteSpace(req.Plan) ? salon.Plan : req.Plan.Trim();
        salon.TrialEndsAtUtc = req.TrialEndsAtUtc;
        salon.SaNote         = req.SaNote?.Trim();

        await _db.SaveChangesAsync();
        return Ok(new { message = "Salon güncellendi." });
    }

    // ── Salon toggle active ───────────────────────────────────────────────────

    [HttpPatch("salons/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleSalon(Guid id)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound();
        salon.IsActive = !salon.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { isActive = salon.IsActive });
    }

    // ── Module list for a salon ───────────────────────────────────────────────

    [HttpGet("salons/{id:guid}/modules")]
    public async Task<IActionResult> GetModules(Guid id)
    {
        if (!await _db.Salons.AnyAsync(x => x.Id == id))
            return NotFound();

        var licenses = await _db.ModuleLicenses
            .Where(x => x.SalonId == id)
            .ToDictionaryAsync(x => x.ModuleCode);

        var result = AllModuleCodes.Select(code =>
        {
            licenses.TryGetValue(code, out var lic);
            return new ModuleLicenseResponse
            {
                ModuleCode   = code,
                ModuleLabel  = ModuleLabels.GetValueOrDefault(code, code),
                IsActive     = lic?.IsActive ?? false,
                ExpiresAtUtc = lic?.ExpiresAtUtc,
            };
        });

        return Ok(result);
    }

    // ── Toggle / update a module license ─────────────────────────────────────

    [HttpPut("modules/toggle")]
    public async Task<IActionResult> ToggleModule([FromBody] ToggleModuleRequest req)
    {
        if (!await _db.Salons.AnyAsync(x => x.Id == req.SalonId))
            return NotFound(new { message = "Salon bulunamadı." });

        var lic = await _db.ModuleLicenses
            .FirstOrDefaultAsync(x => x.SalonId == req.SalonId && x.ModuleCode == req.ModuleCode);

        if (lic is null)
        {
            _db.ModuleLicenses.Add(new ModuleLicense
            {
                SalonId      = req.SalonId,
                ModuleCode   = req.ModuleCode,
                IsActive     = req.IsActive,
                ExpiresAtUtc = req.ExpiresAtUtc,
            });
        }
        else
        {
            lic.IsActive     = req.IsActive;
            lic.ExpiresAtUtc = req.ExpiresAtUtc;
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Modül güncellendi." });
    }

    // ── Users of a salon ─────────────────────────────────────────────────────

    [HttpGet("salons/{id:guid}/users")]
    public async Task<IActionResult> GetSalonUsers(Guid id)
    {
        if (!await _db.Salons.AnyAsync(x => x.Id == id))
            return NotFound();

        var users = await _db.Users
            .Include(x => x.Role)
            .Where(x => x.SalonId == id)
            .OrderBy(x => x.FullName)
            .Select(x => new
            {
                id           = x.Id,
                fullName     = x.FullName,
                userName     = x.UserName,
                email        = x.Email,
                isActive     = x.IsActive,
                roleName     = x.Role != null ? x.Role.Name : "",
                createdAtUtc = x.CreatedAtUtc,
            })
            .ToListAsync();

        return Ok(users);
    }

    // ── Reset a salon user's password ─────────────────────────────────────────

    [HttpPut("salons/{salonId:guid}/users/{userId:guid}/reset-password")]
    public async Task<IActionResult> ResetUserPassword(Guid salonId, Guid userId, [FromBody] ResetPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest(new { message = "Şifre en az 6 karakter olmalı." });

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId && x.SalonId == salonId);
        if (user is null) return NotFound(new { message = "Kullanıcı bulunamadı." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Şifre güncellendi." });
    }

    // ── Impersonate: get a token scoped to a salon admin ─────────────────────

    [HttpPost("salons/{id:guid}/impersonate")]
    public async Task<IActionResult> Impersonate(Guid id, [FromBody] ImpersonateRequest? req)
    {
        var salon = await _db.Salons.FindAsync(id);
        if (salon is null) return NotFound(new { message = "Salon bulunamadı." });
        if (!salon.IsActive) return BadRequest(new { message = "Salon pasif." });

        User? target;
        if (req?.UserId.HasValue == true)
        {
            target = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .FirstOrDefaultAsync(x => x.Id == req.UserId.Value && x.SalonId == id);
        }
        else
        {
            target = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .Where(x => x.SalonId == id && x.IsActive && x.Role != null && x.Role.Name == "SalonYonetici")
                .FirstOrDefaultAsync();
        }

        if (target is null)
            return NotFound(new { message = "Hedef kullanıcı bulunamadı." });

        var token = _tokenService.CreateToken(target);
        return Ok(new
        {
            accessToken = token,
            salonName   = salon.Name,
            userName    = target.UserName,
            fullName    = target.FullName,
            role        = target.Role?.Name,
        });
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        return Ok(new
        {
            totalSalons       = await _db.Salons.CountAsync(),
            activeSalons      = await _db.Salons.CountAsync(x => x.IsActive),
            totalUsers        = await _db.Users.CountAsync(),
            totalCustomers    = await _db.Customers.CountAsync(),
            totalAppointments = await _db.Appointments.CountAsync(),
        });
    }

    // ── Announcements ─────────────────────────────────────────────────────────

    [HttpGet("announcements")]
    public async Task<IActionResult> GetAnnouncements()
    {
        var list = await _db.Announcements
            .OrderByDescending(x => x.Priority)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync();

        return Ok(list.Select(ToAnnouncementDetailResponse));
    }

    [HttpPost("announcements")]
    public async Task<IActionResult> CreateAnnouncement([FromBody] XCut.Api.DTOs.CreateAdvancedAnnouncementRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { message = "Başlık zorunlu." });

        var ann = new XCut.Api.Models.Announcement
        {
            Id                  = Guid.NewGuid(),
            Title               = req.Title.Trim(),
            Body                = req.Body,
            Type                = req.Type ?? "info",
            Priority            = req.Priority,
            IsPublished         = req.IsPublished,
            StartsAtUtc         = req.StartsAtUtc,
            ExpiresAtUtc        = req.ExpiresAtUtc,
            ExcludedSalonIds    = req.ExcludedSalonIds ?? "[]",
            IsRecurring         = req.IsRecurring,
            RecurrenceType      = req.RecurrenceType,
            RecurrenceDays      = req.RecurrenceDays,
            RecurrenceStartTime = req.RecurrenceStartTime,
            RecurrenceEndTime   = req.RecurrenceEndTime,
            CreatedAtUtc        = DateTime.UtcNow,
            UpdatedAtUtc        = DateTime.UtcNow,
        };
        _db.Announcements.Add(ann);
        await _db.SaveChangesAsync();
        return Ok(ToAnnouncementDetailResponse(ann));
    }

    [HttpPut("announcements/{id:guid}")]
    public async Task<IActionResult> UpdateAnnouncement(Guid id, [FromBody] XCut.Api.DTOs.CreateAdvancedAnnouncementRequest req)
    {
        var ann = await _db.Announcements.FindAsync(id);
        if (ann is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { message = "Başlık zorunlu." });

        ann.Title               = req.Title.Trim();
        ann.Body                = req.Body;
        ann.Type                = req.Type ?? "info";
        ann.Priority            = req.Priority;
        ann.IsPublished         = req.IsPublished;
        ann.StartsAtUtc         = req.StartsAtUtc;
        ann.ExpiresAtUtc        = req.ExpiresAtUtc;
        ann.ExcludedSalonIds    = req.ExcludedSalonIds ?? "[]";
        ann.IsRecurring         = req.IsRecurring;
        ann.RecurrenceType      = req.RecurrenceType;
        ann.RecurrenceDays      = req.RecurrenceDays;
        ann.RecurrenceStartTime = req.RecurrenceStartTime;
        ann.RecurrenceEndTime   = req.RecurrenceEndTime;
        ann.UpdatedAtUtc        = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToAnnouncementDetailResponse(ann));
    }

    [HttpDelete("announcements/{id:guid}")]
    public async Task<IActionResult> DeleteAnnouncement(Guid id)
    {
        var ann = await _db.Announcements.FindAsync(id);
        if (ann is null) return NotFound();
        _db.Announcements.Remove(ann);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("announcements/{id:guid}/publish")]
    public async Task<IActionResult> TogglePublishAnnouncement(Guid id)
    {
        var ann = await _db.Announcements.FindAsync(id);
        if (ann is null) return NotFound();
        ann.IsPublished  = !ann.IsPublished;
        ann.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { isPublished = ann.IsPublished });
    }

    private static XCut.Api.DTOs.AnnouncementDetailResponse ToAnnouncementDetailResponse(XCut.Api.Models.Announcement a) =>
        new(a.Id, a.Title, a.Body, a.Type, a.Priority,
            a.IsPublished, a.StartsAtUtc, a.ExpiresAtUtc,
            a.ExcludedSalonIds, a.IsRecurring, a.RecurrenceType,
            a.RecurrenceDays, a.RecurrenceStartTime, a.RecurrenceEndTime,
            a.ReadCount, a.CreatedAtUtc, a.UpdatedAtUtc);

    // ── Support (admin side) ──────────────────────────────────────────────────

    [HttpGet("support")]
    public async Task<IActionResult> GetTickets([FromQuery] string? status)
    {
        var query = _db.SupportTickets
            .Include(x => x.Messages)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Status == status);

        var tickets = await query
            .OrderByDescending(x => x.UpdatedAtUtc)
            .ToListAsync();

        return Ok(tickets.Select(ToTicketDetailResponse));
    }

    [HttpGet("support/{id:guid}")]
    public async Task<IActionResult> GetTicket(Guid id)
    {
        var ticket = await _db.SupportTickets
            .Include(x => x.Messages)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (ticket is null) return NotFound();
        return Ok(ToTicketDetailResponse(ticket));
    }

    [HttpPost("support/{id:guid}/reply")]
    public async Task<IActionResult> AdminReply(Guid id, [FromBody] XCut.Api.DTOs.AddMessageRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Body))
            return BadRequest(new { message = "Mesaj boş olamaz." });

        var ticket = await _db.SupportTickets.FindAsync(id);
        if (ticket is null) return NotFound();

        var msg = new XCut.Api.Models.SupportMessage
        {
            Id           = Guid.NewGuid(),
            TicketId     = ticket.Id,
            Body         = req.Body,
            IsFromAdmin  = true,
            AuthorName   = "xCut Destek",
            CreatedAtUtc = DateTime.UtcNow,
        };
        _db.SupportMessages.Add(msg);
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new XCut.Api.DTOs.SupportMessageDto(
            msg.Id, msg.Body, msg.IsFromAdmin, msg.AuthorName, msg.CreatedAtUtc));
    }

    [HttpPatch("support/{id:guid}/status")]
    public async Task<IActionResult> UpdateTicketStatus(Guid id, [FromBody] XCut.Api.DTOs.UpdateTicketStatusRequest2 req)
    {
        var ticket = await _db.SupportTickets.FindAsync(id);
        if (ticket is null) return NotFound();
        ticket.Status       = req.Status;
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { status = ticket.Status });
    }

    private static XCut.Api.DTOs.SupportTicketDetailResponse ToTicketDetailResponse(XCut.Api.Models.SupportTicket t) =>
        new(t.Id, t.SalonId, t.SalonName, t.UserName,
            t.Subject, t.PageContext, t.Status,
            t.CreatedAtUtc, t.UpdatedAtUtc,
            t.Messages.Count,
            t.Messages.OrderBy(m => m.CreatedAtUtc)
                .Select(m => new XCut.Api.DTOs.SupportMessageDto(
                    m.Id, m.Body, m.IsFromAdmin, m.AuthorName, m.CreatedAtUtc))
                .ToList());

    // ── User Salon Access (çok-lokasyon salon gezintisi) ─────────────────────

    [HttpGet("users/{userId:guid}/salon-accesses")]
    public async Task<IActionResult> GetUserSalonAccesses(Guid userId)
    {
        var accesses = await _db.UserSalonAccesses
            .Where(x => x.UserId == userId)
            .Include(x => x.Salon)
            .OrderBy(x => x.GrantedAtUtc)
            .Select(x => new { salonId = x.SalonId, salonName = x.Salon!.Name, grantedAtUtc = x.GrantedAtUtc })
            .ToListAsync();
        return Ok(accesses);
    }

    [HttpPost("users/{userId:guid}/salon-accesses")]
    public async Task<IActionResult> GrantSalonAccess(Guid userId, [FromBody] GrantSalonAccessRequest req)
    {
        var user  = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound(new { message = "Kullanıcı bulunamadı." });

        var salon = await _db.Salons.FindAsync(req.SalonId);
        if (salon is null) return NotFound(new { message = "Salon bulunamadı." });

        if (req.SalonId == user.SalonId)
            return BadRequest(new { message = "Kullanıcının kendi salonu zaten mevcut." });

        var existing = await _db.UserSalonAccesses
            .AnyAsync(x => x.UserId == userId && x.SalonId == req.SalonId);
        if (existing)
            return BadRequest(new { message = "Bu erişim zaten tanımlı." });

        _db.UserSalonAccesses.Add(new XCut.Api.Models.UserSalonAccess
        {
            UserId  = userId,
            SalonId = req.SalonId,
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Erişim verildi.", salonName = salon.Name });
    }

    [HttpDelete("users/{userId:guid}/salon-accesses/{salonId:guid}")]
    public async Task<IActionResult> RevokeSalonAccess(Guid userId, Guid salonId)
    {
        var access = await _db.UserSalonAccesses
            .FirstOrDefaultAsync(x => x.UserId == userId && x.SalonId == salonId);
        if (access is null) return NotFound(new { message = "Erişim bulunamadı." });

        _db.UserSalonAccesses.Remove(access);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

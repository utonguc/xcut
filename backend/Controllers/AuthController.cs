// Controllers/AuthController.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITokenService _tokenService;
    private readonly IWebHostEnvironment _env;
    private readonly IAuditService _audit;
    private readonly IGoogleCalendarService _gcal;
    private readonly InMemorySessionStore _sessionStore;
    private readonly MfaService _mfa;
    private readonly IEmailService _email;

    public AuthController(AppDbContext db, ITokenService tokenService, IWebHostEnvironment env,
        IAuditService audit, IGoogleCalendarService gcal, InMemorySessionStore sessionStore,
        MfaService mfa, IEmailService email)
    {
        _db           = db;
        _tokenService = tokenService;
        _env          = env;
        _audit        = audit;
        _gcal         = gcal;
        _sessionStore = sessionStore;
        _mfa          = mfa;
        _email        = email;
    }

    private Guid? GetCurrentUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? id : null;
    }

    private static bool IsStrongPassword(string password) =>
        password.Length >= 8 &&
        password.Any(char.IsUpper) &&
        password.Any(char.IsDigit) &&
        password.Any(c => !char.IsLetterOrDigit(c));

    // POST api/auth/login
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "E-posta ve şifre zorunludur." });

        var email   = request.Email.Trim().ToLowerInvariant();
        var atIndex = email.IndexOf('@');
        if (atIndex < 0)
            return BadRequest(new { message = "Geçerli bir e-posta adresi girin." });

        var domain = email[(atIndex + 1)..];

        var salon = await _db.Salons
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.EmailDomain == domain);

        User? user;

        if (salon is not null)
        {
            user = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .FirstOrDefaultAsync(x => x.SalonId == salon.Id && x.Email == email);
        }
        else
        {
            var matches = await _db.Users
                .Include(x => x.Role)
                .Include(x => x.Salon)
                .Where(x => x.Email == email)
                .ToListAsync();

            if (matches.Count > 1)
                return Unauthorized(new {
                    message = "Bu e-posta birden fazla salonda kayıtlı. Lütfen yöneticinizden salon domain'ini tanımlamasını isteyin."
                });

            user = matches.FirstOrDefault();
        }

        if (user is null || !user.IsActive || user.Salon is null || !user.Salon.IsActive)
            return Unauthorized(new { message = "Geçersiz kullanıcı bilgisi." });

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            _ = _audit.LogAsync(user.Salon!.Id, user.Id, "User", user.Id.ToString(), "LoginFailed",
                $"{user.FullName} için başarısız giriş denemesi", null,
                HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { message = "Geçersiz kullanıcı bilgisi." });
        }

        if (user.Salon.TrialEndsAtUtc.HasValue && user.Salon.TrialEndsAtUtc.Value < DateTime.UtcNow)
            return Unauthorized(new { message = "Demo süreniz dolmuştur. Devam etmek için lütfen bizimle iletişime geçin.", trialExpired = true });

        var daysLeft = user.Salon.TrialEndsAtUtc.HasValue
            ? (int)Math.Max(0, (user.Salon.TrialEndsAtUtc.Value - DateTime.UtcNow).TotalDays)
            : (int?)null;

        // MFA check
        var orgSetting = await _db.OrganizationSettings.FirstOrDefaultAsync(x => x.SalonId == user.SalonId);
        if (orgSetting?.MfaEnabled == true && !string.IsNullOrWhiteSpace(user.Email))
        {
            var (mfaToken, mfaCode) = _mfa.Generate(user.Id);
            _ = _email.SendAsync(user.Email, "xCut Giriş Doğrulama Kodu", BuildOtpEmail(user.FullName, mfaCode));
            var masked = MaskEmail(user.Email);
            return Ok(new { requiresMfa = true, mfaSessionToken = mfaToken, maskedEmail = masked });
        }

        _ = _audit.LogAsync(user.Salon.Id, user.Id, "User", user.Id.ToString(), "Login",
            $"{user.FullName} sisteme giriş yaptı", null,
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new LoginResponse
        {
            AccessToken   = _tokenService.CreateToken(user),
            ExpiresAtUtc  = _tokenService.GetExpiryUtc(),
            UserName      = user.UserName,
            FullName      = user.FullName,
            Role          = user.Role?.Name,
            TrialDaysLeft = daysLeft,
        });
    }

    // GET api/auth/me
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users
            .Include(x => x.Role)
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (user is null || user.Salon is null) return NotFound();

        var jwtSalonIdClaim  = User.FindFirstValue("salonId");
        var effectiveSalonId = Guid.TryParse(jwtSalonIdClaim, out var sid) ? sid : user.SalonId;
        var effectiveSalon   = effectiveSalonId == user.SalonId
            ? user.Salon
            : await _db.Salons.FindAsync(effectiveSalonId) ?? user.Salon;

        var activeModules = await _db.ModuleLicenses
            .Where(x => x.SalonId == effectiveSalonId && x.IsActive &&
                        (x.ExpiresAtUtc == null || x.ExpiresAtUtc > DateTime.UtcNow))
            .Select(x => x.ModuleCode)
            .ToListAsync();

        // Permission modules from assigned groups
        var groups = await _db.UserPermissionGroups
            .Where(x => x.UserId == user.Id)
            .Include(x => x.Group)
            .Select(x => x.Group!)
            .ToListAsync();

        List<string> permissionModules;
        bool isSelfOnly = false;

        if (groups.Count > 0)
        {
            var allModules = new HashSet<string>();
            foreach (var g in groups)
            {
                var mods = JsonSerializer.Deserialize<List<string>>(g.AllowedModules) ?? new();
                foreach (var m in mods) allModules.Add(m);
                if (g.IsSelfOnly) isSelfOnly = true;
            }
            permissionModules = allModules.ToList();
        }
        else
        {
            // Default by role
            permissionModules = (user.Role?.Name ?? "") switch
            {
                "Stilist"    => new() { "appointments", "tasks" },
                "Kasiyer"    => new() { "kasa", "finance", "reports" },
                "Resepsiyon" => new() { "appointments", "customers", "services", "tasks" },
                _            => new() // empty = all modules for Admin
            };
            isSelfOnly = user.Role?.Name == "Stilist";
        }

        // Link user to stylist by email for isSelfOnly filtering
        string? linkedStylistId = null;
        if (isSelfOnly && !string.IsNullOrWhiteSpace(user.Email))
        {
            var stylist = await _db.Stylists
                .Where(s => s.SalonId == effectiveSalonId && s.Email != null && s.Email.ToLower() == user.Email.ToLower())
                .Select(s => s.Id)
                .FirstOrDefaultAsync();
            if (stylist != default) linkedStylistId = stylist.ToString();
        }

        return Ok(new MeResponse
        {
            UserId             = user.Id.ToString(),
            SalonId            = effectiveSalonId.ToString(),
            SalonName          = effectiveSalon!.Name,
            UserName           = user.UserName,
            FullName           = user.FullName,
            Email              = user.Email,
            Role               = user.Role?.Name,
            ActiveModules      = activeModules,
            PermissionModules  = permissionModules,
            IsSelfOnly         = isSelfOnly,
            StylistId          = linkedStylistId,
            ProfilePhotoUrl    = user.ProfilePhotoUrl,
        });
    }

    // PUT api/auth/profile
    [Authorize]
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.FullName))
            return BadRequest(new { message = "Ad Soyad zorunlu." });

        if (!string.IsNullOrWhiteSpace(request.Email) && request.Email != user.Email)
        {
            var exists = await _db.Users.AnyAsync(x =>
                x.SalonId == user.SalonId && x.Email == request.Email && x.Id != user.Id);
            if (exists) return BadRequest(new { message = "Bu e-posta adresi zaten kullanımda." });
        }

        user.FullName = request.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(request.Email))
            user.Email = request.Email.Trim();

        await _db.SaveChangesAsync();
        return Ok(new { message = "Profil güncellendi." });
    }

    // POST api/auth/photo
    [Authorize]
    [HttpPost("photo")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> UploadPhoto([FromForm] IFormFile file)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return NotFound();

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "Dosya bulunamadı." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!new[] { ".png", ".jpg", ".jpeg", ".webp" }.Contains(ext))
            return BadRequest(new { message = "Desteklenmeyen dosya türü." });

        // Read into memory to validate magic bytes before writing
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var bytes = ms.GetBuffer();
        var isValidMime =
            (ms.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) ||           // JPEG
            (ms.Length >= 4 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) || // PNG
            (ms.Length >= 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46    // WebP: RIFF...WEBP
                              && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50);
        if (!isValidMime)
            return BadRequest(new { message = "Geçersiz dosya içeriği." });

        var dir = Path.Combine(_env.ContentRootPath, "uploads", "users");
        Directory.CreateDirectory(dir);

        var fileName = $"{userId}{ext}";
        ms.Position = 0;
        await using var stream = System.IO.File.Create(Path.Combine(dir, fileName));
        await ms.CopyToAsync(stream);

        user.ProfilePhotoUrl = $"/uploads/users/{fileName}";
        await _db.SaveChangesAsync();

        return Ok(new { profilePhotoUrl = user.ProfilePhotoUrl });
    }

    // POST api/auth/change-password
    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return NotFound("Kullanıcı bulunamadı.");

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Mevcut şifre yanlış." });

        if (string.IsNullOrWhiteSpace(request.NewPassword) || !IsStrongPassword(request.NewPassword))
            return BadRequest(new { message = "Şifre en az 8 karakter, büyük harf, rakam ve özel karakter içermelidir." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Şifre başarıyla değiştirildi." });
    }

    // GET api/auth/google-url  (unauthenticated)
    [HttpGet("google-url")]
    [AllowAnonymous]
    public IActionResult GoogleUrl()
    {
        if (!_gcal.IsConfigured)
            return BadRequest(new { message = "Google ile giriş henüz yapılandırılmamış." });
        return Ok(new { url = _gcal.GetSignInUrl() });
    }

    // GET api/auth/google/callback?code=...&state=...
    [HttpGet("google/callback")]
    [AllowAnonymous]
    public async Task<IActionResult> GoogleCallback(
        [FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error)
    {
        const string front = "/login";

        if (!string.IsNullOrEmpty(error))
            return Redirect($"{front}?google_error={Uri.EscapeDataString(error)}");

        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
            return Redirect($"{front}?google_error=missing_params");

        if (!_gcal.ValidateSignInState(state))
            return Redirect($"{front}?google_error=invalid_state");

        var tokens = await _gcal.ExchangeSignInCodeAsync(code);
        if (tokens == null || string.IsNullOrEmpty(tokens.Email))
            return Redirect($"{front}?google_error=exchange_failed");

        var email = tokens.Email.Trim().ToLowerInvariant();
        var user  = await _db.Users
            .Include(x => x.Role)
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Email.ToLower() == email && x.IsActive);

        if (user == null || user.Salon == null || !user.Salon.IsActive)
            return Redirect($"{front}?google_error=no_user");

        if (user.Salon.TrialEndsAtUtc.HasValue && user.Salon.TrialEndsAtUtc.Value < DateTime.UtcNow)
            return Redirect($"{front}?google_error=trial_expired");

        // Save personal calendar token (fire-and-forget — login still proceeds on failure)
        if (!string.IsNullOrEmpty(tokens.AccessToken))
        {
            try
            {
                await _gcal.SaveUserCalendarTokenAsync(
                    user.SalonId, user.Id, email,
                    tokens.AccessToken, tokens.RefreshToken, tokens.ExpiresIn, tokens.CalendarName);
            }
            catch { /* non-critical */ }
        }

        var jwt  = _tokenService.CreateToken(user);
        var code2 = _sessionStore.CreateCode(jwt);

        _ = _audit.LogAsync(user.Salon.Id, user.Id, "User", user.Id.ToString(), "GoogleLogin",
            $"{user.FullName} Google ile giriş yaptı", null,
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Redirect($"{front}?session={code2}");
    }

    // GET api/auth/session/{code}  (unauthenticated)
    [HttpGet("session/{code}")]
    [AllowAnonymous]
    public IActionResult Session(string code)
    {
        var token = _sessionStore.TakeToken(code);
        if (token == null) return BadRequest(new { message = "Oturum kodu geçersiz veya süresi doldu." });
        return Ok(new { accessToken = token });
    }

    // POST api/auth/verify-mfa
    [HttpPost("verify-mfa")]
    [AllowAnonymous]
    [EnableRateLimiting("mfa")]
    public async Task<IActionResult> VerifyMfa([FromBody] VerifyMfaRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.MfaSessionToken) || string.IsNullOrWhiteSpace(req.Code))
            return BadRequest(new { message = "Token ve kod zorunlu." });

        var userId = _mfa.Verify(req.MfaSessionToken, req.Code.Trim());
        if (userId is null)
            return Unauthorized(new { message = "Geçersiz veya süresi dolmuş doğrulama kodu." });

        var user = await _db.Users
            .Include(x => x.Role)
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Id == userId.Value);

        if (user is null || !user.IsActive || user.Salon is null || !user.Salon.IsActive)
            return Unauthorized(new { message = "Kullanıcı bulunamadı." });

        var daysLeft = user.Salon.TrialEndsAtUtc.HasValue
            ? (int)Math.Max(0, (user.Salon.TrialEndsAtUtc.Value - DateTime.UtcNow).TotalDays)
            : (int?)null;

        _ = _audit.LogAsync(user.Salon.Id, user.Id, "User", user.Id.ToString(), "Login",
            $"{user.FullName} MFA ile sisteme giriş yaptı", null,
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new LoginResponse
        {
            AccessToken   = _tokenService.CreateToken(user),
            ExpiresAtUtc  = _tokenService.GetExpiryUtc(),
            UserName      = user.UserName,
            FullName      = user.FullName,
            Role          = user.Role?.Name,
            TrialDaysLeft = daysLeft,
        });
    }

    // POST api/Auth/forgot-password  (unauthenticated)
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        const string neutral = "Eğer bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi.";
        if (string.IsNullOrWhiteSpace(req.Email)) return BadRequest(new { message = "E-posta zorunludur." });

        var email = req.Email.Trim().ToLowerInvariant();
        var user  = await _db.Users.Include(x => x.Salon).FirstOrDefaultAsync(x => x.Email == email && x.IsActive);
        if (user is null || user.Salon is null || !user.Salon.IsActive)
            return Ok(new { message = neutral });

        var tokenBytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(32);
        var token      = Convert.ToHexString(tokenBytes).ToLowerInvariant();

        _db.PasswordResetTokens.Add(new XCut.Api.Models.PasswordResetToken
        {
            UserId       = user.Id,
            Token        = token,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15),
        });
        await _db.SaveChangesAsync();

        var resetUrl = $"https://xcut.xshield.com.tr/reset-password?token={token}";
        _ = _email.SendAsync(email, "xCut Şifre Sıfırlama", BuildResetEmail(user.FullName, resetUrl));

        return Ok(new { message = neutral });
    }

    // POST api/Auth/reset-password  (unauthenticated)
    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] XCut.Api.DTOs.PasswordResetRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Token) || string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(new { message = "Token ve yeni şifre zorunludur." });

        if (!IsStrongPassword(req.NewPassword))
            return BadRequest(new { message = "Şifre en az 8 karakter, büyük harf, rakam ve özel karakter içermelidir." });

        var resetToken = await _db.PasswordResetTokens
            .FirstOrDefaultAsync(x => x.Token == req.Token && x.UsedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow);

        if (resetToken is null)
            return BadRequest(new { message = "Geçersiz veya süresi dolmuş sıfırlama bağlantısı." });

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == resetToken.UserId && x.IsActive);
        if (user is null) return BadRequest(new { message = "Kullanıcı bulunamadı." });

        user.PasswordHash  = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        resetToken.UsedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Şifreniz başarıyla sıfırlandı. Giriş yapabilirsiniz." });
    }

    // GET api/Auth/my-salons
    [Authorize]
    [HttpGet("my-salons")]
    public async Task<IActionResult> MySalons()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users.Include(x => x.Salon).FirstOrDefaultAsync(x => x.Id == userId.Value);
        if (user is null || user.Salon is null) return Unauthorized();

        var accessSalons = await _db.UserSalonAccesses
            .Where(x => x.UserId == userId.Value)
            .Include(x => x.Salon)
            .ToListAsync();

        var result = new List<SalonAccessItem>
        {
            new() { SalonId = user.SalonId.ToString(), SalonName = user.Salon.Name, IsHome = true }
        };

        foreach (var a in accessSalons.Where(a => a.SalonId != user.SalonId))
        {
            result.Add(new SalonAccessItem
            {
                SalonId   = a.SalonId.ToString(),
                SalonName = a.Salon?.Name ?? "—",
                IsHome    = false,
            });
        }

        return Ok(result);
    }

    // POST api/Auth/switch-salon
    [Authorize]
    [HttpPost("switch-salon")]
    public async Task<IActionResult> SwitchSalon([FromBody] SwitchSalonRequest req)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var user = await _db.Users
            .Include(x => x.Role)
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Id == userId.Value);

        if (user is null) return Unauthorized();

        var homeSalonClaim = User.FindFirstValue("homeSalonId");
        var homeSalonId    = Guid.TryParse(homeSalonClaim, out var hid) ? hid : user.SalonId;

        // Allow switching to home salon or any granted salon
        bool allowed = req.TargetSalonId == user.SalonId
                    || req.TargetSalonId == homeSalonId
                    || await _db.UserSalonAccesses.AnyAsync(x => x.UserId == userId.Value && x.SalonId == req.TargetSalonId);

        if (!allowed) return Forbid();

        var targetSalon = await _db.Salons.FindAsync(req.TargetSalonId);
        if (targetSalon is null || !targetSalon.IsActive)
            return BadRequest(new { message = "Hedef salon bulunamadı veya pasif." });

        var newToken = _tokenService.CreateToken(user,
            req.TargetSalonId == user.SalonId ? null : req.TargetSalonId);

        return Ok(new
        {
            accessToken = newToken,
            salonId     = req.TargetSalonId.ToString(),
            salonName   = targetSalon.Name,
        });
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 1) return email;
        return email[0] + new string('*', Math.Min(at - 1, 4)) + email[at..];
    }

    private static string BuildResetEmail(string name, string resetUrl) => $$"""
        <!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
        <style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:0;}
        .wrap{max-width:520px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);}
        .hd{background:#7c3aed;padding:28px 32px;}.hd h1{color:#fff;margin:0;font-size:20px;font-weight:800;}
        .bd{padding:32px;}.btn{display:inline-block;padding:14px 28px;background:#7c3aed;color:#fff;font-weight:800;font-size:15px;border-radius:12px;text-decoration:none;margin:20px 0;}
        .ft{padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;}
        </style></head>
        <body><div class="wrap">
        <div class="hd"><h1>&#x1F510; Şifre Sıfırlama</h1></div>
        <div class="bd">
        <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Merhaba {{System.Net.WebUtility.HtmlEncode(name)}},</p>
        <p style="color:#64748b;font-size:14px;margin:0 0 4px;">Şifrenizi sıfırlamak için aşağıdaki butona tıklayın.</p>
        <a class="btn" href="{{resetUrl}}">Şifremi Sıfırla →</a>
        <p style="color:#94a3b8;font-size:13px;margin-top:8px;">Bu bağlantı <strong>15 dakika</strong> geçerlidir. Eğer bu işlemi siz başlatmadıysanız lütfen dikkate almayın.</p>
        <p style="color:#94a3b8;font-size:12px;word-break:break-all;">Ya da şu adresi kopyalayın: {{resetUrl}}</p>
        </div>
        <div class="ft">&#169; {{DateTime.UtcNow.Year}} xCut — Powered by xShield.</div>
        </div></body></html>
        """;

    private static string BuildOtpEmail(string name, string code) => $$"""
        <!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
        <style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:0;}
        .wrap{max-width:520px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);}
        .hd{background:#7c3aed;padding:28px 32px;}.hd h1{color:#fff;margin:0;font-size:20px;font-weight:800;}
        .bd{padding:32px;}.code{font-size:40px;font-weight:900;letter-spacing:12px;color:#7c3aed;background:#f5f3ff;border-radius:12px;padding:20px;text-align:center;margin:20px 0;font-family:monospace;}
        .ft{padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;}
        </style></head>
        <body><div class="wrap">
        <div class="hd"><h1>&#x1F510; Giriş Doğrulama Kodu</h1></div>
        <div class="bd">
        <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Merhaba {{System.Net.WebUtility.HtmlEncode(name)}},</p>
        <p style="color:#64748b;font-size:14px;margin:0 0 4px;">xCut'a giriş yapmak için aşağıdaki kodu kullanın:</p>
        <div class="code">{{code}}</div>
        <p style="color:#94a3b8;font-size:13px;">Bu kod <strong>10 dakika</strong> geçerlidir. Eğer bu işlemi siz başlatmadıysanız lütfen bu maili dikkate almayın.</p>
        </div>
        <div class="ft">&#169; {{DateTime.UtcNow.Year}} xCut — Powered by xShield. Bu mail otomatik gönderilmiştir.</div>
        </div></body></html>
        """;
}

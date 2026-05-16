using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using XCut.Api.Data;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class KioskController : ControllerBase
{
    private readonly AppDbContext          _db;
    private readonly ITokenService         _tokens;
    private readonly KioskEventBroadcaster _broadcaster;
    private readonly IConfiguration        _config;

    public KioskController(AppDbContext db, ITokenService tokens, KioskEventBroadcaster broadcaster, IConfiguration config)
    {
        _db          = db;
        _tokens      = tokens;
        _broadcaster = broadcaster;
        _config      = config;
    }

    private static readonly HashSet<string> _ytDownloading = new();
    private static readonly object _ytDlLock = new();

    private Guid? GetSalonId()
    {
        var raw = User.FindFirstValue("salonId");
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private Guid? GetKioskCodeId()
    {
        var raw = User.FindFirstValue("kioskCodeId");
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    // ── Auth ─────────────────────────────────────────────────────────────────

    [AllowAnonymous]
    [HttpPost("auth")]
    public async Task<IActionResult> Auth([FromBody] KioskAuthRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code))
            return BadRequest(new { message = "Kod gerekli." });

        var code = req.Code.Trim().ToUpper();

        var kioskCode = await _db.KioskCodes
            .Include(k => k.Salon)
            .Include(k => k.Playlist).ThenInclude(p => p!.Slides.OrderBy(s => s.SortOrder))
            .FirstOrDefaultAsync(k => k.Code == code && k.IsActive &&
                (k.ExpiresAtUtc == null || k.ExpiresAtUtc > DateTime.UtcNow));

        if (kioskCode is null)
            return Unauthorized(new { message = "Geçersiz veya süresi dolmuş kod." });

        var token = _tokens.CreateKioskToken(kioskCode.SalonId, kioskCode.Id, kioskCode.Label);

        var playlist = kioskCode.Playlist is null ? null : new
        {
            id     = kioskCode.Playlist.Id,
            name   = kioskCode.Playlist.Name,
            slides = kioskCode.Playlist.Slides.Select(s => new
            {
                s.Id, s.Type, s.Content, s.DurationSeconds, s.Title, s.SortOrder
            }),
        };

        return Ok(new
        {
            token,
            salonId       = kioskCode.SalonId,
            salonName     = kioskCode.Salon?.Name ?? "",
            label         = kioskCode.Label ?? "",
            displayLayout = kioskCode.DisplayLayout,
            playlist,
        });
    }

    // ── Queue ────────────────────────────────────────────────────────────────

    [Authorize]
    [HttpGet("queue")]
    public async Task<IActionResult> GetQueue()
    {
        var salonId = GetSalonId() ?? await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var todayUtc    = DateTime.UtcNow.Date;
        var tomorrowUtc = todayUtc.AddDays(1);

        var appointments = await _db.Appointments
            .Where(a => a.SalonId == salonId.Value &&
                        a.StartAtUtc >= todayUtc && a.StartAtUtc < tomorrowUtc &&
                        a.Status != "Cancelled")
            .Include(a => a.Stylist)
            .OrderBy(a => a.StartAtUtc)
            .Select(a => new
            {
                a.Id,
                CustomerName = a.Customer != null ? a.Customer.FirstName + " " + a.Customer.LastName : "Müşteri",
                StylistName  = a.Stylist != null ? a.Stylist.FullName : null,
                ServiceName  = a.ServiceName,
                a.StartAtUtc,
                a.Status,
            })
            .ToListAsync();

        var salon = await _db.Salons.Where(s => s.Id == salonId.Value).Select(s => s.Name).FirstOrDefaultAsync();

        // For kiosk tokens: include playlist data so screen can refresh
        object? playlist = null;
        var kioskCodeId = GetKioskCodeId();
        if (kioskCodeId.HasValue)
        {
            var kc = await _db.KioskCodes
                .Include(k => k.Playlist).ThenInclude(p => p!.Slides.OrderBy(s => s.SortOrder))
                .FirstOrDefaultAsync(k => k.Id == kioskCodeId.Value);

            if (kc?.Playlist is not null)
            {
                playlist = new
                {
                    id     = kc.Playlist.Id,
                    name   = kc.Playlist.Name,
                    slides = kc.Playlist.Slides.Select(s => new
                    {
                        s.Id, s.Type, s.Content, s.DurationSeconds, s.Title, s.SortOrder
                    }),
                };
            }
        }

        return Ok(new { salonName = salon, appointments, playlist });
    }

    // ── Kiosk Codes ──────────────────────────────────────────────────────────

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpGet("codes")]
    public async Task<IActionResult> GetCodes()
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var codes = await _db.KioskCodes
            .Where(k => k.SalonId == salonId.Value)
            .OrderByDescending(k => k.CreatedAtUtc)
            .Select(k => new
            {
                k.Id, k.Code, k.Label, k.IsActive, k.ExpiresAtUtc, k.CreatedAtUtc,
                k.DisplayLayout, k.PlaylistId,
            })
            .ToListAsync();

        return Ok(codes);
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("codes")]
    public async Task<IActionResult> CreateCode([FromBody] CreateKioskCodeRequest req)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var code = await GenerateUniqueCode(salonId.Value);

        var kioskCode = new KioskCode
        {
            SalonId       = salonId.Value,
            Code          = code,
            Label         = req.Label?.Trim(),
            IsActive      = true,
            ExpiresAtUtc  = req.ExpiresAtUtc,
            DisplayLayout = req.DisplayLayout ?? "sidebar",
        };
        _db.KioskCodes.Add(kioskCode);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            kioskCode.Id, kioskCode.Code, kioskCode.Label, kioskCode.IsActive,
            kioskCode.ExpiresAtUtc, kioskCode.CreatedAtUtc,
            kioskCode.DisplayLayout, kioskCode.PlaylistId,
        });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPatch("codes/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleCode(Guid id)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var code = await _db.KioskCodes.FirstOrDefaultAsync(k => k.Id == id && k.SalonId == salonId.Value);
        if (code is null) return NotFound();

        code.IsActive = !code.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { code.IsActive });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPatch("codes/{id:guid}/settings")]
    public async Task<IActionResult> UpdateCodeSettings(Guid id, [FromBody] UpdateKioskCodeSettingsRequest req)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var code = await _db.KioskCodes.FirstOrDefaultAsync(k => k.Id == id && k.SalonId == salonId.Value);
        if (code is null) return NotFound();

        if (req.DisplayLayout is not null)
            code.DisplayLayout = req.DisplayLayout;

        // Validate playlist belongs to this salon
        if (req.PlaylistId.HasValue)
        {
            var ok = await _db.KioskPlaylists.AnyAsync(p => p.Id == req.PlaylistId.Value && p.SalonId == salonId.Value);
            if (!ok) return BadRequest(new { message = "Playlist bulunamadı." });
            code.PlaylistId = req.PlaylistId.Value;
        }
        else if (req.ClearPlaylist)
        {
            code.PlaylistId = null;
        }

        await _db.SaveChangesAsync();
        return Ok(new { code.DisplayLayout, code.PlaylistId });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("codes/{id:guid}")]
    public async Task<IActionResult> DeleteCode(Guid id)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var code = await _db.KioskCodes.FirstOrDefaultAsync(k => k.Id == id && k.SalonId == salonId.Value);
        if (code is null) return NotFound();

        _db.KioskCodes.Remove(code);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Kod silindi." });
    }

    // ── Playlists ─────────────────────────────────────────────────────────────

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpGet("playlists")]
    public async Task<IActionResult> GetPlaylists()
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var playlists = await _db.KioskPlaylists
            .Where(p => p.SalonId == salonId.Value)
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new
            {
                p.Id, p.Name, p.CreatedAtUtc,
                slideCount = p.Slides.Count,
            })
            .ToListAsync();

        return Ok(playlists);
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("playlists")]
    public async Task<IActionResult> CreatePlaylist([FromBody] CreatePlaylistRequest req)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Playlist adı zorunlu." });

        var playlist = new KioskPlaylist { SalonId = salonId.Value, Name = req.Name.Trim() };
        _db.KioskPlaylists.Add(playlist);
        await _db.SaveChangesAsync();

        return Ok(new { playlist.Id, playlist.Name, playlist.CreatedAtUtc, slideCount = 0 });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("playlists/{id:guid}")]
    public async Task<IActionResult> UpdatePlaylist(Guid id, [FromBody] CreatePlaylistRequest req)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var pl = await _db.KioskPlaylists.FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);
        if (pl is null) return NotFound();

        pl.Name = req.Name?.Trim() ?? pl.Name;
        await _db.SaveChangesAsync();
        return Ok(new { pl.Id, pl.Name });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("playlists/{id:guid}")]
    public async Task<IActionResult> DeletePlaylist(Guid id)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var pl = await _db.KioskPlaylists.FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);
        if (pl is null) return NotFound();

        _db.KioskPlaylists.Remove(pl);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Playlist silindi." });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpGet("playlists/{id:guid}/slides")]
    public async Task<IActionResult> GetSlides(Guid id)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var pl = await _db.KioskPlaylists
            .Include(p => p.Slides.OrderBy(s => s.SortOrder))
            .FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);

        if (pl is null) return NotFound();

        return Ok(pl.Slides.Select(s => new
        {
            s.Id, s.Type, s.Content, s.DurationSeconds, s.Title, s.SortOrder
        }));
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPut("playlists/{id:guid}/slides")]
    public async Task<IActionResult> ReplaceSlides(Guid id, [FromBody] List<SlideRequest> slides)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var pl = await _db.KioskPlaylists
            .Include(p => p.Slides)
            .FirstOrDefaultAsync(p => p.Id == id && p.SalonId == salonId.Value);

        if (pl is null) return NotFound();

        _db.KioskSlides.RemoveRange(pl.Slides);

        var newSlides = slides.Select((s, i) => new KioskSlide
        {
            PlaylistId      = id,
            SortOrder       = i,
            Type            = s.Type,
            Content         = s.Content,
            DurationSeconds = s.Type == "youtube" ? Math.Max(3600, s.DurationSeconds) : Math.Max(3, s.DurationSeconds),
            Title           = s.Title,
        }).ToList();

        _db.KioskSlides.AddRange(newSlides);
        await _db.SaveChangesAsync();

        return Ok(newSlides.Select(s => new { s.Id, s.Type, s.Content, s.DurationSeconds, s.Title, s.SortOrder }));
    }

    // ── Media ─────────────────────────────────────────────────────────────────

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpGet("media")]
    public async Task<IActionResult> GetMedia()
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var items = await _db.KioskMediaItems
            .Where(m => m.SalonId == salonId.Value)
            .OrderByDescending(m => m.UploadedAtUtc)
            .Select(m => new { m.Id, m.OriginalName, m.FileUrl, m.MimeType, m.FileSizeBytes, m.UploadedAtUtc })
            .ToListAsync();

        return Ok(items);
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("media/upload")]
    public async Task<IActionResult> UploadMedia(IFormFile file)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "Dosya seçilmedi." });

        const long maxSize = 100 * 1024 * 1024; // 100 MB
        if (file.Length > maxSize)
            return BadRequest(new { message = "Dosya boyutu 100 MB'ı geçemez." });

        var allowed = new[] { "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm" };
        if (!allowed.Contains(file.ContentType.ToLower()))
            return BadRequest(new { message = "Desteklenmeyen dosya tipi. JPG, PNG, GIF, WebP, MP4, WebM yüklenebilir." });

        var ext      = Path.GetExtension(file.FileName).ToLower();
        var fileName = $"{Guid.NewGuid()}{ext}";
        var dir      = Path.Combine("/app/uploads/kiosk", salonId.Value.ToString());
        Directory.CreateDirectory(dir);

        var fullPath = Path.Combine(dir, fileName);
        await using var stream = System.IO.File.Create(fullPath);
        await file.CopyToAsync(stream);

        var fileUrl = $"/uploads/kiosk/{salonId.Value}/{fileName}";

        var media = new KioskMedia
        {
            SalonId       = salonId.Value,
            FileName      = fileName,
            OriginalName  = file.FileName,
            FileUrl       = fileUrl,
            MimeType      = file.ContentType,
            FileSizeBytes = file.Length,
        };
        _db.KioskMediaItems.Add(media);
        await _db.SaveChangesAsync();

        return Ok(new { media.Id, media.OriginalName, media.FileUrl, media.MimeType, media.FileSizeBytes, media.UploadedAtUtc });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("media/{id:guid}")]
    public async Task<IActionResult> DeleteMedia(Guid id)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var m = await _db.KioskMediaItems.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (m is null) return NotFound();

        // Only delete physical file for uploaded items (not external URLs)
        if (!m.FileUrl.StartsWith("http"))
        {
            var fullPath = Path.Combine("/app", m.FileUrl.TrimStart('/'));
            if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath);
        }

        _db.KioskMediaItems.Remove(m);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Medya silindi." });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("media/add-url")]
    public async Task<IActionResult> AddMediaUrl([FromBody] AddMediaUrlRequest req)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Url))
            return BadRequest(new { message = "URL zorunludur." });

        // Auto-detect type from URL if not provided
        var mimeType = req.MediaType switch
        {
            "youtube" => "video/youtube",
            "video"   => "video/mp4",
            _         => "image/jpeg",
        };

        var media = new KioskMedia
        {
            SalonId       = salonId.Value,
            FileName      = "",
            OriginalName  = req.Name?.Trim() ?? req.Url,
            FileUrl       = req.Url.Trim(),
            MimeType      = mimeType,
            FileSizeBytes = 0,
        };
        _db.KioskMediaItems.Add(media);
        await _db.SaveChangesAsync();

        return Ok(new { media.Id, media.OriginalName, media.FileUrl, media.MimeType, media.FileSizeBytes, media.UploadedAtUtc });
    }

    // ── TV Pairing ────────────────────────────────────────────────────────────

    [AllowAnonymous]
    [HttpPost("pairing/init")]
    public async Task<IActionResult> PairingInit()
    {
        // Clean up expired requests older than 24h
        var cutoff = DateTime.UtcNow.AddHours(-24);
        var old = _db.KioskPairingRequests.Where(p => p.ExpiresAtUtc < cutoff);
        _db.KioskPairingRequests.RemoveRange(old);

        // Generate unique 6-char code: XXX-XXX
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var rng = new Random();
        string code;
        do
        {
            var p1 = new string(Enumerable.Range(0, 3).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
            var p2 = new string(Enumerable.Range(0, 3).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
            code = $"{p1}-{p2}";
        } while (await _db.KioskPairingRequests.AnyAsync(p => p.PairingCode == code && p.ExpiresAtUtc > DateTime.UtcNow));

        var req = new KioskPairingRequest
        {
            PairingCode  = code,
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10),
            IsAccepted   = false,
        };
        _db.KioskPairingRequests.Add(req);
        await _db.SaveChangesAsync();

        return Ok(new { code, expiresAtUtc = req.ExpiresAtUtc });
    }

    [AllowAnonymous]
    [HttpGet("pairing/{code}/status")]
    public async Task<IActionResult> PairingStatus(string code)
    {
        var req = await _db.KioskPairingRequests
            .FirstOrDefaultAsync(p => p.PairingCode == code.ToUpper() && p.ExpiresAtUtc > DateTime.UtcNow);

        if (req is null)
            return NotFound(new { message = "Kod bulunamadı veya süresi doldu." });

        if (!req.IsAccepted)
            return Ok(new { accepted = false });

        return Ok(new
        {
            accepted      = true,
            token         = req.KioskToken,
            salonName     = req.SalonName,
            displayLayout = req.DisplayLayout,
        });
    }

    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpPost("pairing/{code}/accept")]
    public async Task<IActionResult> PairingAccept(string code, [FromBody] AcceptPairingRequest body)
    {
        var salonId = await GetSalonIdFromUser();
        if (salonId is null) return Unauthorized();

        var pairing = await _db.KioskPairingRequests
            .FirstOrDefaultAsync(p => p.PairingCode == code.ToUpper() && p.ExpiresAtUtc > DateTime.UtcNow && !p.IsAccepted);

        if (pairing is null)
            return NotFound(new { message = "Eşleştirme kodu bulunamadı veya süresi doldu." });

        // Validate playlist if provided
        if (body.PlaylistId.HasValue)
        {
            var ok = await _db.KioskPlaylists.AnyAsync(p => p.Id == body.PlaylistId.Value && p.SalonId == salonId.Value);
            if (!ok) return BadRequest(new { message = "Playlist bulunamadı." });
        }

        var salon = await _db.Salons.FirstOrDefaultAsync(s => s.Id == salonId.Value);
        var kioskCode = new KioskCode
        {
            SalonId       = salonId.Value,
            Code          = await GenerateUniqueCode(salonId.Value),
            Label         = body.Label?.Trim() ?? $"TV {code}",
            IsActive      = true,
            DisplayLayout = body.DisplayLayout ?? "sidebar",
            PlaylistId    = body.PlaylistId,
        };
        _db.KioskCodes.Add(kioskCode);

        var tokenStr = _tokens.CreateKioskToken(salonId.Value, kioskCode.Id, body.Label?.Trim());

        pairing.IsAccepted    = true;
        pairing.KioskToken    = tokenStr;
        pairing.SalonId       = salonId.Value;
        pairing.SalonName     = salon?.Name ?? "";
        pairing.DisplayLayout = body.DisplayLayout ?? "sidebar";
        pairing.PlaylistId    = body.PlaylistId;
        pairing.Label         = body.Label;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            kioskCode.Id, kioskCode.Code, kioskCode.Label, kioskCode.IsActive,
            kioskCode.CreatedAtUtc, kioskCode.DisplayLayout, kioskCode.PlaylistId,
        });
    }

    // ── YouTube Download & Serve ─────────────────────────────────────────────

    [AllowAnonymous]
    [HttpGet("youtube-url")]
    public IActionResult GetYoutubeUrl([FromQuery] string? v)
    {
        if (string.IsNullOrWhiteSpace(v) ||
            !System.Text.RegularExpressions.Regex.IsMatch(v, @"^[A-Za-z0-9_\-]{6,15}$"))
            return BadRequest(new { message = "Geçersiz video ID" });

        string vid = v;
        var dir      = "/app/uploads/kiosk/youtube";
        Directory.CreateDirectory(dir);
        var filePath = Path.Combine(dir, $"{vid}.mp4");
        var serveUrl = $"/uploads/kiosk/youtube/{vid}.mp4";

        if (System.IO.File.Exists(filePath))
            return Ok(new { url = serveUrl, ready = true });

        bool start;
        lock (_ytDlLock) { start = _ytDownloading.Add(vid); }

        if (start)
        {
            _ = Task.Run(async () =>
            {
                var tmp = filePath + ".tmp";
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "yt-dlp", UseShellExecute = false,
                        RedirectStandardOutput = true, RedirectStandardError = true,
                        CreateNoWindow = true,
                    };
                    psi.ArgumentList.Add("-f");
                    psi.ArgumentList.Add("bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/18/22/best[height<=720]");
                    psi.ArgumentList.Add("--merge-output-format"); psi.ArgumentList.Add("mp4");
                    psi.ArgumentList.Add("-o"); psi.ArgumentList.Add(tmp);
                    psi.ArgumentList.Add($"https://www.youtube.com/watch?v={vid}");

                    using var cts  = new CancellationTokenSource(TimeSpan.FromMinutes(10));
                    using var proc = Process.Start(psi)!;
                    await proc.WaitForExitAsync(cts.Token);

                    if (proc.ExitCode == 0 && System.IO.File.Exists(tmp))
                        System.IO.File.Move(tmp, filePath, overwrite: true);
                }
                catch { }
                finally
                {
                    if (System.IO.File.Exists(tmp)) System.IO.File.Delete(tmp);
                    lock (_ytDlLock) { _ytDownloading.Remove(vid); }
                }
            });
        }

        return Ok(new { url = (string?)null, ready = false });
    }

    // ── SSE ───────────────────────────────────────────────────────────────────

    [AllowAnonymous]
    [HttpGet("events")]
    public async Task EventStream([FromQuery] string? token, CancellationToken ct)
    {
        var raw = token;
        if (string.IsNullOrWhiteSpace(raw))
        {
            var hdr = Request.Headers.Authorization.ToString();
            if (hdr.StartsWith("Bearer ")) raw = hdr[7..];
        }

        var salonId = ExtractSalonId(raw);
        if (salonId is null) { Response.StatusCode = 401; return; }

        Response.Headers["Content-Type"]      = "text/event-stream";
        Response.Headers["Cache-Control"]     = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";

        var (subId, channel) = _broadcaster.Subscribe(salonId.Value);
        try
        {
            await Response.WriteAsync("event: connected\ndata: {}\n\n", ct);
            await Response.Body.FlushAsync(ct);

            await foreach (var msg in channel.Reader.ReadAllAsync(ct))
            {
                await Response.WriteAsync(msg, ct);
                await Response.Body.FlushAsync(ct);
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            _broadcaster.Unsubscribe(salonId.Value, subId);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<Guid?> GetSalonIdFromUser()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var uid)) return null;
        return await _db.Users.Where(u => u.Id == uid).Select(u => (Guid?)u.SalonId).FirstOrDefaultAsync();
    }

    private async Task<string> GenerateUniqueCode(Guid salonId)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var rng = new Random();
        string code;
        do
        {
            var part1 = new string(Enumerable.Range(0, 4).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
            var part2 = new string(Enumerable.Range(0, 4).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
            code = $"{part1}-{part2}";
        } while (await _db.KioskCodes.AnyAsync(k => k.SalonId == salonId && k.Code == code));
        return code;
    }

    private Guid? ExtractSalonId(string? rawToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken)) return null;
        try
        {
            var key = _config["Jwt:Key"];
            if (key is null) return null;
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(rawToken, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                ValidateIssuer           = false,
                ValidateAudience         = false,
                ClockSkew                = TimeSpan.Zero,
            }, out _);
            var raw = principal.FindFirstValue("salonId");
            return Guid.TryParse(raw, out var id) ? id : null;
        }
        catch { return null; }
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

public class KioskAuthRequest        { public string Code { get; set; } = ""; }
public class CreateKioskCodeRequest  { public string? Label { get; set; } public DateTime? ExpiresAtUtc { get; set; } public string? DisplayLayout { get; set; } }
public class UpdateKioskCodeSettingsRequest { public string? DisplayLayout { get; set; } public Guid? PlaylistId { get; set; } public bool ClearPlaylist { get; set; } }
public class CreatePlaylistRequest   { public string? Name { get; set; } }
public class SlideRequest            { public string Type { get; set; } = "html"; public string Content { get; set; } = ""; public int DurationSeconds { get; set; } = 10; public string? Title { get; set; } }
public class AddMediaUrlRequest      { public string Url { get; set; } = ""; public string MediaType { get; set; } = "image"; public string? Name { get; set; } }
public class AcceptPairingRequest    { public string? Label { get; set; } public string? DisplayLayout { get; set; } public Guid? PlaylistId { get; set; } }

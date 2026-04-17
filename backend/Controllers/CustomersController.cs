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
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;

    public CustomersController(AppDbContext db) => _db = db;

    private async Task<Guid?> GetSalonIdAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;
        return await _db.Users.Where(x => x.Id == userId).Select(x => (Guid?)x.SalonId).FirstOrDefaultAsync();
    }

    // GET api/customers?search=&status=&page=1&pageSize=50
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 50)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(1, page);

        var q = _db.Customers.Where(x => x.SalonId == salonId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower().Trim();
            q = q.Where(x =>
                x.FirstName.ToLower().Contains(s) ||
                x.LastName.ToLower().Contains(s)  ||
                (x.Phone != null && x.Phone.Contains(s)) ||
                (x.Email != null && x.Email.ToLower().Contains(s)));
        }

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(x => x.CustomerStatus == status);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(x => x.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new CustomerResponse
            {
                Id = x.Id, FirstName = x.FirstName, LastName = x.LastName,
                Phone = x.Phone, Email = x.Email, BirthDate = x.BirthDate,
                Gender = x.Gender, Country = x.Country, City = x.City,
                PreferredService = x.PreferredService, CustomerStatus = x.CustomerStatus,
                StyleNotes = x.StyleNotes, Notes = x.Notes,
                CreatedAtUtc = x.CreatedAtUtc, UpdatedAtUtc = x.UpdatedAtUtc
            })
            .ToListAsync();

        Response.Headers["X-Total-Count"] = total.ToString();
        return Ok(items);
    }

    // GET api/customers/status-counts
    [HttpGet("status-counts")]
    public async Task<IActionResult> GetStatusCounts()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var counts = await _db.Customers
            .Where(x => x.SalonId == salonId.Value)
            .GroupBy(x => x.CustomerStatus)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var result = CustomerStatuses.All.Select(s => new
        {
            status = s,
            count  = counts.FirstOrDefault(x => x.Status == s)?.Count ?? 0
        });

        return Ok(result);
    }

    // GET api/customers/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (c is null) return NotFound(new { message = "Müşteri bulunamadı." });

        return Ok(Map(c));
    }

    // POST api/customers
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCustomerRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.FirstName)) return BadRequest(new { message = "Ad zorunlu." });
        if (string.IsNullOrWhiteSpace(req.LastName))  return BadRequest(new { message = "Soyad zorunlu." });

        var c = new Customer
        {
            SalonId          = salonId.Value,
            FirstName        = req.FirstName.Trim(),
            LastName         = req.LastName.Trim(),
            Phone            = req.Phone?.Trim(),
            Email            = req.Email?.Trim().ToLower(),
            BirthDate        = req.BirthDate.HasValue
                                 ? DateTime.SpecifyKind(req.BirthDate.Value.Date, DateTimeKind.Utc)
                                 : null,
            Gender           = req.Gender,
            Country          = req.Country?.Trim(),
            City             = req.City?.Trim(),
            PreferredService = req.PreferredService?.Trim(),
            CustomerStatus   = string.IsNullOrWhiteSpace(req.CustomerStatus) ? CustomerStatuses.New : req.CustomerStatus,
            StyleNotes       = req.StyleNotes,
            Notes            = req.Notes
        };

        _db.Customers.Add(c);
        await _db.SaveChangesAsync();
        return Ok(c.Id);
    }

    // PUT api/customers/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCustomerRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (c is null) return NotFound(new { message = "Müşteri bulunamadı." });

        if (string.IsNullOrWhiteSpace(req.FirstName)) return BadRequest(new { message = "Ad zorunlu." });
        if (string.IsNullOrWhiteSpace(req.LastName))  return BadRequest(new { message = "Soyad zorunlu." });

        c.FirstName        = req.FirstName.Trim();
        c.LastName         = req.LastName.Trim();
        c.Phone            = req.Phone?.Trim();
        c.Email            = req.Email?.Trim().ToLower();
        c.BirthDate        = req.BirthDate.HasValue
                               ? DateTime.SpecifyKind(req.BirthDate.Value.Date, DateTimeKind.Utc)
                               : null;
        c.Gender           = req.Gender;
        c.Country          = req.Country?.Trim();
        c.City             = req.City?.Trim();
        c.PreferredService = req.PreferredService?.Trim();
        if (!string.IsNullOrWhiteSpace(req.CustomerStatus)) c.CustomerStatus = req.CustomerStatus;
        c.StyleNotes       = req.StyleNotes;
        c.Notes            = req.Notes;
        c.UpdatedAtUtc     = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(c.Id);
    }

    // PATCH api/customers/{id}/status
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateCustomerStatusRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!CustomerStatuses.All.Contains(req.CustomerStatus))
            return BadRequest(new { message = $"Geçersiz durum. Geçerli: {string.Join(", ", CustomerStatuses.All)}" });

        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (c is null) return NotFound(new { message = "Müşteri bulunamadı." });

        c.CustomerStatus = req.CustomerStatus;
        c.UpdatedAtUtc   = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { id = c.Id, customerStatus = c.CustomerStatus });
    }

    // DELETE api/customers/{id}
    [Authorize(Roles = "SuperAdmin,SalonYonetici")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var c = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (c is null) return NotFound(new { message = "Müşteri bulunamadı." });

        _db.Customers.Remove(c);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST api/customers/import  — CSV bulk import
    [HttpPost("import")]
    public async Task<IActionResult> ImportCsv(IFormFile file)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();
        if (file is null || file.Length == 0) return BadRequest(new { message = "Dosya boş." });
        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Yalnızca .csv dosyası kabul edilir." });

        using var reader = new System.IO.StreamReader(file.OpenReadStream());
        var headerLine = await reader.ReadLineAsync();
        if (headerLine is null) return BadRequest(new { message = "Dosya boş." });

        var cols = headerLine.Split(',').Select(c => c.Trim().Trim('"').ToLowerInvariant()).ToArray();
        int Idx(params string[] aliases) {
            foreach (var a in aliases) {
                var i = Array.IndexOf(cols, a.ToLowerInvariant());
                if (i >= 0) return i;
            }
            return -1;
        }
        int iFirst  = Idx("ad", "firstname", "isim", "name");
        int iLast   = Idx("soyad", "lastname", "soyadı");
        int iPhone  = Idx("telefon", "phone", "tel");
        int iEmail  = Idx("email", "e-posta", "eposta");
        int iGender = Idx("cinsiyet", "gender");
        int iBirth  = Idx("doğumtarihi", "dogumtarihi", "birthdate", "doğum tarihi");
        int iCity   = Idx("şehir", "sehir", "city");
        int iCountry= Idx("ülke", "ulke", "country");
        int iService= Idx("tercihledhizmet", "preferredservice", "hizmet");
        int iNotes  = Idx("notlar", "notes", "not");

        if (iFirst < 0 || iLast < 0)
            return BadRequest(new { message = "CSV başlık satırında 'Ad' ve 'Soyad' kolonları zorunludur." });

        var imported = 0;
        var skipped  = 0;
        var errors   = new List<string>();
        var row      = 0;

        while (!reader.EndOfStream)
        {
            row++;
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;

            var fields = ParseCsvLine(line);
            string Cell(int i) => i >= 0 && i < fields.Length ? fields[i].Trim().Trim('"') : "";

            var firstName = Cell(iFirst);
            var lastName  = Cell(iLast);
            if (string.IsNullOrWhiteSpace(firstName) || string.IsNullOrWhiteSpace(lastName))
            {
                errors.Add($"Satır {row}: Ad veya soyad boş, atlandı.");
                skipped++;
                continue;
            }

            DateTime? birthDate = null;
            var birthStr = Cell(iBirth);
            if (!string.IsNullOrEmpty(birthStr) && DateTime.TryParse(birthStr, out var bd))
                birthDate = DateTime.SpecifyKind(bd.Date, DateTimeKind.Utc);

            _db.Customers.Add(new Customer
            {
                SalonId          = salonId.Value,
                FirstName        = firstName,
                LastName         = lastName,
                Phone            = Cell(iPhone)   is { Length: > 0 } p  ? p  : null,
                Email            = Cell(iEmail)   is { Length: > 0 } e  ? e.ToLower() : null,
                Gender           = Cell(iGender)  is { Length: > 0 } g  ? g  : null,
                BirthDate        = birthDate,
                City             = Cell(iCity)    is { Length: > 0 } c  ? c  : null,
                Country          = Cell(iCountry) is { Length: > 0 } u  ? u  : null,
                PreferredService = Cell(iService) is { Length: > 0 } sv ? sv : null,
                Notes            = Cell(iNotes)   is { Length: > 0 } n  ? n  : null,
                CustomerStatus   = CustomerStatuses.New,
            });
            imported++;

            if (imported % 50 == 0) await _db.SaveChangesAsync();
        }

        if (imported > 0) await _db.SaveChangesAsync();

        return Ok(new { imported, skipped, errors, total = row });
    }

    private static string[] ParseCsvLine(string line)
    {
        var result  = new List<string>();
        var current = new System.Text.StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')          { inQuotes = !inQuotes; }
            else if (c == ',' && !inQuotes) { result.Add(current.ToString()); current.Clear(); }
            else                   { current.Append(c); }
        }
        result.Add(current.ToString());
        return result.ToArray();
    }

    // GET api/customers/import/template
    [HttpGet("import/template")]
    public IActionResult DownloadTemplate()
    {
        var csv = "Ad,Soyad,Telefon,Email,Cinsiyet,DoğumTarihi,Şehir,Ülke,TercihEdilenHizmet,Notlar\n" +
                  "Ayşe,Yılmaz,+905551234567,ayse@example.com,Kadın,1990-05-15,İstanbul,Türkiye,Saç Kesimi,\n" +
                  "Fatma,Kaya,+905559876543,fatma@example.com,Kadın,1985-08-22,Ankara,Türkiye,Manikür,VIP müşteri";
        return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", "musteri_import_sablonu.csv");
    }

    private static CustomerResponse Map(Customer c) => new()
    {
        Id = c.Id, FirstName = c.FirstName, LastName = c.LastName,
        Phone = c.Phone, Email = c.Email, BirthDate = c.BirthDate,
        Gender = c.Gender, Country = c.Country, City = c.City,
        PreferredService = c.PreferredService, CustomerStatus = c.CustomerStatus,
        StyleNotes = c.StyleNotes, Notes = c.Notes,
        CreatedAtUtc = c.CreatedAtUtc, UpdatedAtUtc = c.UpdatedAtUtc
    };
}

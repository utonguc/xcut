using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/Customers/{customerId:guid}/photos")]
[Authorize]
public class CustomerPhotosController : ControllerBase
{
    private readonly AppDbContext  _db;
    private readonly IWebHostEnvironment _env;

    public CustomerPhotosController(AppDbContext db, IWebHostEnvironment env) { _db = db; _env = env; }

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // GET /api/Customers/{customerId}/photos
    [HttpGet]
    public async Task<IActionResult> GetAll(Guid customerId)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!await _db.Customers.AnyAsync(c => c.Id == customerId && c.SalonId == salonId.Value))
            return NotFound();

        var photos = await _db.CustomerPhotos
            .Where(p => p.CustomerId == customerId && p.SalonId == salonId.Value)
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new { p.Id, p.PhotoUrl, p.Type, p.ServiceName, p.Notes, p.AppointmentId, p.CreatedAtUtc })
            .ToListAsync();

        return Ok(photos);
    }

    // POST /api/Customers/{customerId}/photos
    [HttpPost]
    public async Task<IActionResult> Upload(Guid customerId, IFormFile file,
        [FromForm] string type = "After",
        [FromForm] string? serviceName = null,
        [FromForm] string? notes = null,
        [FromForm] Guid? appointmentId = null)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (!await _db.Customers.AnyAsync(c => c.Id == customerId && c.SalonId == salonId.Value))
            return NotFound();

        if (file.Length == 0) return BadRequest(new { message = "Dosya boş." });
        var ext = Path.GetExtension(file.FileName).ToLower();
        if (!new[] { ".jpg", ".jpeg", ".png", ".webp" }.Contains(ext))
            return BadRequest(new { message = "Sadece JPG, PNG veya WEBP yüklenebilir." });
        if (file.Length > 10 * 1024 * 1024)
            return BadRequest(new { message = "Dosya 10 MB'dan büyük olamaz." });

        var dir = Path.Combine(_env.ContentRootPath, "uploads", "customer-photos");
        Directory.CreateDirectory(dir);
        var fileName = $"{Guid.NewGuid()}{ext}";
        var filePath = Path.Combine(dir, fileName);

        await using (var stream = System.IO.File.Create(filePath))
            await file.CopyToAsync(stream);

        var photo = new CustomerPhoto
        {
            SalonId       = salonId.Value,
            CustomerId    = customerId,
            PhotoUrl      = $"/uploads/customer-photos/{fileName}",
            Type          = type,
            ServiceName   = serviceName?.Trim(),
            Notes         = notes?.Trim(),
            AppointmentId = appointmentId,
        };
        _db.CustomerPhotos.Add(photo);
        await _db.SaveChangesAsync();

        return Ok(new { photo.Id, photo.PhotoUrl, photo.Type, photo.ServiceName, photo.Notes, photo.CreatedAtUtc });
    }

    // DELETE /api/Customers/{customerId}/photos/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid customerId, Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var photo = await _db.CustomerPhotos.FirstOrDefaultAsync(p => p.Id == id && p.CustomerId == customerId && p.SalonId == salonId.Value);
        if (photo is null) return NotFound();

        // Delete physical file
        var filePath = Path.Combine(_env.ContentRootPath, photo.PhotoUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        if (System.IO.File.Exists(filePath)) System.IO.File.Delete(filePath);

        _db.CustomerPhotos.Remove(photo);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Fotoğraf silindi." });
    }
}

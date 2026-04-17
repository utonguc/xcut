namespace XCut.Api.Models;

public class Stylist
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SalonId { get; set; }
    public Salon? Salon { get; set; }

    // ── Temel ────────────────────────────────────────────────────────────────
    public string FullName { get; set; } = string.Empty;
    /// <summary>Uzmanlık alanı: Saç | Tırnak | Cilt | Makyaj | Sakal</summary>
    public string? Specialty { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;

    // ── Profil ────────────────────────────────────────────────────────────────
    public string? PhotoUrl { get; set; }
    public string? Biography { get; set; }
    public string? Specializations { get; set; }   // virgülle ayrılmış liste
    public int? ExperienceYears { get; set; }
    public string? Certificates { get; set; }      // virgülle ayrılmış liste

    // ── Meta ──────────────────────────────────────────────────────────────────
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}

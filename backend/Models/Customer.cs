namespace XCut.Api.Models;

public class Customer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SalonId { get; set; }
    public Salon? Salon { get; set; }

    // ── Temel bilgiler ────────────────────────────────────────────────────────
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public DateTime? BirthDate { get; set; }
    public string? Gender { get; set; }
    public string? Country { get; set; }
    public string? City { get; set; }

    // ── Kuaför CRM alanları ───────────────────────────────────────────────────
    /// <summary>Tercih ettiği hizmet türü: Saç Kesimi, Manikür, vb.</summary>
    public string? PreferredService { get; set; }
    public string CustomerStatus { get; set; } = CustomerStatuses.New;

    // ── Stil Notları (saç rengi, tercihler, alerjiler vb.) ─────────────────────
    /// <summary>Saç rengi, tercih edilen stiller, ürün tercihleri, alerjiler vb.</summary>
    public string? StyleNotes { get; set; }
    /// <summary>Genel notlar</summary>
    public string? Notes { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}

public static class CustomerStatuses
{
    public const string New       = "Yeni";
    public const string Active    = "Aktif";
    public const string Vip       = "VIP";
    public const string Inactive  = "Pasif";
    public const string Scheduled = "Randevu Var";

    public static readonly string[] All =
        [New, Active, Vip, Inactive, Scheduled];
}

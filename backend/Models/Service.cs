namespace XCut.Api.Models;

/// <summary>Salon hizmet kataloğu. Müşteriye sunulan tüm hizmetler burada tanımlanır.</summary>
public class Service
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SalonId { get; set; }
    public Salon? Salon { get; set; }

    public string Name { get; set; } = string.Empty;
    /// <summary>Saç | Tırnak | Cilt | Makyaj | Sakal</summary>
    public string Category { get; set; } = string.Empty;
    public int DurationMinutes { get; set; } = 30;
    public decimal Price { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

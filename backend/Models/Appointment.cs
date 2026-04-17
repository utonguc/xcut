// Models/Appointment.cs
namespace XCut.Api.Models;

public class Appointment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SalonId { get; set; }
    public Salon? Salon { get; set; }
    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public Guid StylistId { get; set; }
    public Stylist? Stylist { get; set; }
    /// <summary>Nullable FK to service catalog; free-text ServiceName kept for flexibility.</summary>
    public Guid? ServiceId { get; set; }
    public Service? Service { get; set; }
    public string ServiceName { get; set; } = string.Empty;
    public DateTime StartAtUtc { get; set; }
    public DateTime EndAtUtc { get; set; }
    public string? Notes { get; set; }
    // Scheduled | Completed | Cancelled | NoShow
    public string Status { get; set; } = "Scheduled";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

namespace XCut.Api.Models;

public class Salon
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? City { get; set; }
    public string? Country { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Personel login için e-posta domain doğrulaması. Ör: "salon-a.com.tr"
    /// Bu domain'e sahip e-postalar otomatik olarak bu salona yönlendirilir.
    /// </summary>
    public string? EmailDomain { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>null = ömür boyu, dolmuşsa hesap kilitlenir</summary>
    public DateTime? TrialEndsAtUtc { get; set; }

    /// <summary>trial | starter | salon | pro</summary>
    public string? Plan { get; set; }

    /// <summary>Comma-separated day numbers that are weekly day-offs (0=Sun…6=Sat). E.g. "0" = Sunday, "0,1" = Sun+Mon.</summary>
    public string WeeklyOffDays { get; set; } = "0";

    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Customer> Customers { get; set; } = new List<Customer>();
    public ICollection<Stylist> Stylists { get; set; } = new List<Stylist>();
    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
    public ICollection<Service> Services { get; set; } = new List<Service>();
}

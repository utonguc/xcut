namespace XCut.Api.Models;

/// <summary>Weekly working hours per stylist.</summary>
public class StylistSchedule
{
    public Guid   Id              { get; set; } = Guid.NewGuid();
    public Guid   StylistId       { get; set; }
    public Guid   SalonId         { get; set; }
    public int    DayOfWeek       { get; set; }  // 0=Sun … 6=Sat
    public TimeSpan StartTime     { get; set; }  // e.g. 09:00
    public TimeSpan EndTime       { get; set; }  // e.g. 17:00
    public int    SlotMinutes     { get; set; } = 30;
    public bool   IsActive        { get; set; } = true;

    public Stylist? Stylist  { get; set; }
    public Salon?   Salon    { get; set; }
}

/// <summary>Stylist leave / vacation blocks.</summary>
public class StylistLeave
{
    public Guid     Id          { get; set; } = Guid.NewGuid();
    public Guid     StylistId   { get; set; }
    public Guid     SalonId     { get; set; }
    public DateTime StartAtUtc  { get; set; }
    public DateTime EndAtUtc    { get; set; }
    public string?  Reason      { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Stylist? Stylist { get; set; }
    public Salon?   Salon   { get; set; }
}

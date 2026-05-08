namespace XCut.Api.Models;

public class ServiceCategory
{
    public Guid    Id            { get; set; } = Guid.NewGuid();
    public Guid    SalonId       { get; set; }
    public string  Name          { get; set; } = string.Empty;
    public string? Description   { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

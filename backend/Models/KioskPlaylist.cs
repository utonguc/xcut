namespace XCut.Api.Models;

public class KioskPlaylist
{
    public Guid   Id           { get; set; } = Guid.NewGuid();
    public Guid   SalonId      { get; set; }
    public string Name         { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<KioskSlide> Slides { get; set; } = [];
}

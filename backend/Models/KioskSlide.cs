namespace XCut.Api.Models;

public class KioskSlide
{
    public Guid    Id              { get; set; } = Guid.NewGuid();
    public Guid    PlaylistId      { get; set; }
    public int     SortOrder       { get; set; }
    // "image" | "video" | "youtube" | "html"
    public string  Type            { get; set; } = "html";
    public string  Content         { get; set; } = "";
    public int     DurationSeconds { get; set; } = 10;
    public string? Title           { get; set; }
}

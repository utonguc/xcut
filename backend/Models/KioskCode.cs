using System.ComponentModel.DataAnnotations.Schema;

namespace XCut.Api.Models;

public class KioskCode
{
    public Guid      Id            { get; set; } = Guid.NewGuid();
    public Guid      SalonId       { get; set; }
    public Salon?    Salon         { get; set; }
    public string    Code          { get; set; } = "";
    public string?   Label         { get; set; }
    public bool      IsActive      { get; set; } = true;
    public DateTime? ExpiresAtUtc  { get; set; }
    public DateTime  CreatedAtUtc  { get; set; } = DateTime.UtcNow;
    // "sidebar" | "overlay"
    public string    DisplayLayout { get; set; } = "sidebar";
    public Guid?     PlaylistId    { get; set; }
    [ForeignKey("PlaylistId")]
    public KioskPlaylist? Playlist { get; set; }
}

namespace XCut.Api.Models;

public class KioskPairingRequest
{
    public Guid     Id            { get; set; } = Guid.NewGuid();
    public string   PairingCode   { get; set; } = "";
    public DateTime CreatedAtUtc  { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc  { get; set; }
    public bool     IsAccepted    { get; set; }
    public string?  KioskToken    { get; set; }
    public Guid?    SalonId       { get; set; }
    public string?  SalonName     { get; set; }
    public string   DisplayLayout { get; set; } = "sidebar";
    public Guid?    PlaylistId    { get; set; }
    public string?  Label         { get; set; }
}

namespace XCut.Api.Models;

public class KioskMedia
{
    public Guid     Id            { get; set; } = Guid.NewGuid();
    public Guid     SalonId       { get; set; }
    public string   FileName      { get; set; } = "";
    public string   OriginalName  { get; set; } = "";
    public string   FileUrl       { get; set; } = "";
    public string   MimeType      { get; set; } = "";
    public long     FileSizeBytes { get; set; }
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}

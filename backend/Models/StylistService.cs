// Models/StylistService.cs
namespace XCut.Api.Models;

public class StylistService
{
    public Guid StylistId  { get; set; }
    public Stylist? Stylist { get; set; }
    public Guid ServiceId  { get; set; }
    public Service? Service { get; set; }
}

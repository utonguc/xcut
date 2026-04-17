using XCut.Api.Data;
using XCut.Api.Models;

namespace XCut.Api.Services;

public interface IAuditService
{
    Task LogAsync(
        Guid salonId,
        Guid? userId,
        string entityType,
        string entityId,
        string action,
        string description,
        object? changes   = null,
        string? ipAddress = null);
}

public class AuditService : IAuditService
{
    private readonly AppDbContext _db;

    public AuditService(AppDbContext db) => _db = db;

    public async Task LogAsync(
        Guid salonId,
        Guid? userId,
        string entityType,
        string entityId,
        string action,
        string description,
        object? changes   = null,
        string? ipAddress = null)
    {
        string? changesJson = null;
        if (changes is not null)
        {
            try { changesJson = System.Text.Json.JsonSerializer.Serialize(changes); }
            catch { /* ignore serialization errors */ }
        }

        _db.AuditLogs.Add(new AuditLog
        {
            SalonId     = salonId,
            UserId      = userId,
            EntityType  = entityType,
            EntityId    = entityId,
            Action      = action,
            Description = description,
            ChangesJson = changesJson,
            IpAddress   = ipAddress,
        });
        await _db.SaveChangesAsync();
    }
}

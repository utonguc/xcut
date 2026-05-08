using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using XCut.Api.Data;
using XCut.Api.Models;

namespace XCut.Api.Controllers;

/// <summary>
/// Statik yardımcı: her rol için varsayılan yetki grubunu oluşturur / atar.
/// </summary>
public static class UserGroupSeeder
{
    public static readonly Dictionary<string, (string DisplayName, string Description, string[] Modules, bool IsSelfOnly, string Color)> ROLE_META = new()
    {
        ["SalonYonetici"] = ("Salon Yöneticisi", "Tüm modüllere tam erişim",
            new[]{"appointments","customers","staff","services","stock","tasks","kasa","finance","reports","whatsapp","audit","website","settings"}, false, "#1d4ed8"),
        ["Stilist"]       = ("Stilist", "Kendi randevu ve puantajını görür, izin talebinde bulunabilir",
            new[]{"appointments","tasks","staff"}, true, "#065f46"),
        ["Kasiyer"]       = ("Kasiyer", "Kasa, finans ve raporlara erişim",
            new[]{"kasa","finance","reports"}, false, "#92400e"),
        ["Resepsiyon"]    = ("Resepsiyon", "Randevu, müşteri, hizmet ve görevlere erişim",
            new[]{"appointments","customers","services","tasks"}, false, "#0e7490"),
        ["Calfa"]         = ("Çırak / Kalfa", "Yalnızca randevu takibi",
            new[]{"appointments"}, false, "#6b21a8"),
        ["Kiosk"]         = ("Kiosk", "Müşteri self-servis randevu ekranı",
            new[]{"appointments"}, false, "#0891b2"),
        ["Muhasebe"]      = ("Muhasebe", "Finans, raporlar ve kasa görünümü",
            new[]{"finance","reports","kasa"}, false, "#0f766e"),
        ["CRM"]           = ("CRM Uzmanı", "Müşteri ilişkileri ve raporlar",
            new[]{"customers","appointments","reports"}, false, "#be185d"),
    };

    public static async Task AssignBuiltInGroupAsync(AppDbContext db, Guid salonId, Guid userId, string roleName)
    {
        if (!ROLE_META.TryGetValue(roleName, out var meta)) return;

        var groupName = $"{meta.DisplayName} (Varsayılan)";
        var group = await db.PermissionGroups.FirstOrDefaultAsync(g =>
            g.SalonId == salonId && g.Name == groupName);

        if (group is null)
        {
            group = new PermissionGroup
            {
                SalonId        = salonId,
                Name           = groupName,
                Description    = meta.Description,
                AllowedModules = JsonSerializer.Serialize(meta.Modules),
                IsSelfOnly     = meta.IsSelfOnly,
                IsBuiltIn      = false,
            };
            db.PermissionGroups.Add(group);
            await db.SaveChangesAsync();
        }

        var exists = await db.UserPermissionGroups
            .AnyAsync(x => x.UserId == userId && x.PermissionGroupId == group.Id);
        if (!exists)
        {
            db.UserPermissionGroups.Add(new UserPermissionGroup
            {
                UserId            = userId,
                PermissionGroupId = group.Id,
            });
            await db.SaveChangesAsync();
        }
    }
}

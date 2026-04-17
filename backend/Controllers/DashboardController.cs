using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;

    public DashboardController(AppDbContext db) => _db = db;

    private async Task<(Guid userId, Guid salonId, string? role)?> GetContextAsync()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return null;

        var user = await _db.Users.Include(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return null;

        return (user.Id, user.SalonId, user.Role?.Name);
    }

    // GET api/dashboard/widgets
    [HttpGet("widgets")]
    public async Task<IActionResult> GetWidgets()
    {
        var ctx = await GetContextAsync();
        if (ctx is null) return Unauthorized();
        var (userId, salonId, role) = ctx.Value;

        var widgets = await _db.DashboardWidgets
            .Where(x => x.SalonId == salonId && x.UserId == userId)
            .OrderBy(x => x.SortOrder)
            .ToListAsync();

        if (widgets.Count == 0 && role is not null)
            widgets = await SeedDefaultWidgetsAsync(userId, salonId, role);

        var result = widgets.Select(w => new DashboardWidgetResponse
        {
            Id         = w.Id,
            WidgetType = w.WidgetType,
            Label      = WidgetTypes.Labels.GetValueOrDefault(w.WidgetType, w.WidgetType),
            SortOrder  = w.SortOrder,
            Size       = w.Size,
            Config     = w.Config
        });

        return Ok(result);
    }

    // GET api/dashboard/available-widgets
    [HttpGet("available-widgets")]
    public IActionResult GetAvailableWidgets()
    {
        var all = WidgetTypes.Labels.Select(kv => new
        {
            widgetType = kv.Key,
            label      = kv.Value
        });
        return Ok(all);
    }

    // POST api/dashboard/widgets
    [HttpPost("widgets")]
    public async Task<IActionResult> SaveWidgets([FromBody] SaveDashboardRequest req)
    {
        var ctx = await GetContextAsync();
        if (ctx is null) return Unauthorized();
        var (userId, salonId, _) = ctx.Value;

        var existing = await _db.DashboardWidgets
            .Where(x => x.SalonId == salonId && x.UserId == userId)
            .ToListAsync();
        _db.DashboardWidgets.RemoveRange(existing);

        var newWidgets = req.Widgets.Select((w, i) => new DashboardWidget
        {
            SalonId    = salonId,
            UserId     = userId,
            WidgetType = w.WidgetType,
            SortOrder  = w.SortOrder > 0 ? w.SortOrder : i,
            Size       = w.Size,
            Config     = w.Config
        }).ToList();

        _db.DashboardWidgets.AddRange(newWidgets);
        await _db.SaveChangesAsync();

        return Ok(new { count = newWidgets.Count });
    }

    // POST api/dashboard/reset
    [HttpPost("reset")]
    public async Task<IActionResult> ResetToDefault()
    {
        var ctx = await GetContextAsync();
        if (ctx is null) return Unauthorized();
        var (userId, salonId, role) = ctx.Value;

        var existing = await _db.DashboardWidgets
            .Where(x => x.SalonId == salonId && x.UserId == userId)
            .ToListAsync();
        _db.DashboardWidgets.RemoveRange(existing);
        await _db.SaveChangesAsync();

        var seeded = await SeedDefaultWidgetsAsync(userId, salonId, role ?? "Resepsiyon");
        return Ok(new { count = seeded.Count });
    }

    // GET api/dashboard/data/{widgetType}
    [HttpGet("data/{widgetType}")]
    public async Task<IActionResult> GetWidgetData(string widgetType)
    {
        var ctx = await GetContextAsync();
        if (ctx is null) return Unauthorized();
        var (_, salonId, _) = ctx.Value;

        var now            = DateTime.UtcNow;
        var monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var lastMonthStart = monthStart.AddMonths(-1);

        static int CalcTrend(int thisMonth, int lastMonth)
            => lastMonth == 0 ? (thisMonth > 0 ? 100 : 0)
                              : (int)Math.Round((thisMonth - lastMonth) * 100.0 / lastMonth);

        switch (widgetType)
        {
            case WidgetTypes.KpiCustomers:
            {
                var total     = await _db.Customers.CountAsync(x => x.SalonId == salonId);
                var thisMonth = await _db.Customers.CountAsync(x => x.SalonId == salonId && x.CreatedAtUtc >= monthStart);
                var lastMonth = await _db.Customers.CountAsync(x => x.SalonId == salonId && x.CreatedAtUtc >= lastMonthStart && x.CreatedAtUtc < monthStart);
                return Ok(new { value = total, label = "Toplam Müşteri", thisMonth, lastMonth, trendPct = CalcTrend(thisMonth, lastMonth) });
            }

            case WidgetTypes.KpiStylists:
                return Ok(new
                {
                    value = await _db.Stylists.CountAsync(x => x.SalonId == salonId && x.IsActive),
                    label = "Aktif Stilist", thisMonth = 0, lastMonth = 0, trendPct = 0
                });

            case WidgetTypes.KpiAppointments:
            {
                var total     = await _db.Appointments.CountAsync(x => x.SalonId == salonId);
                var thisMonth = await _db.Appointments.CountAsync(x => x.SalonId == salonId && x.StartAtUtc >= monthStart);
                var lastMonth = await _db.Appointments.CountAsync(x => x.SalonId == salonId && x.StartAtUtc >= lastMonthStart && x.StartAtUtc < monthStart);
                return Ok(new { value = total, label = "Toplam Randevu", thisMonth, lastMonth, trendPct = CalcTrend(thisMonth, lastMonth) });
            }

            case WidgetTypes.KpiRevenue:
            {
                var invoices  = await _db.Invoices.Where(x => x.SalonId == salonId && x.Status == InvoiceStatuses.Paid && x.IssuedAtUtc >= monthStart).SumAsync(x => x.Total);
                return Ok(new { value = invoices, label = "Bu Ay Gelir (₺)", thisMonth = (int)invoices, lastMonth = 0, trendPct = 0 });
            }

            case WidgetTypes.CalendarUpcoming:
                return Ok(await _db.Appointments
                    .Where(x => x.SalonId == salonId && x.StartAtUtc >= now && x.StartAtUtc <= now.AddDays(7))
                    .OrderBy(x => x.StartAtUtc)
                    .Take(10)
                    .Select(x => new
                    {
                        x.Id,
                        Customer    = x.Customer!.FirstName + " " + x.Customer.LastName,
                        Stylist     = x.Stylist!.FullName,
                        x.ServiceName,
                        x.StartAtUtc,
                        x.Status
                    })
                    .ToListAsync());

            case WidgetTypes.ListLatestAppts:
                return Ok(await _db.Appointments
                    .Where(x => x.SalonId == salonId)
                    .OrderByDescending(x => x.StartAtUtc)
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        Customer    = x.Customer!.FirstName + " " + x.Customer.LastName,
                        Stylist     = x.Stylist!.FullName,
                        x.ServiceName,
                        x.StartAtUtc,
                        x.Status
                    })
                    .ToListAsync());

            case WidgetTypes.ChartStylistLoad:
                return Ok(await _db.Appointments
                    .Where(x => x.SalonId == salonId && x.StartAtUtc >= now && x.StartAtUtc <= now.AddDays(7))
                    .GroupBy(x => x.Stylist!.FullName)
                    .Select(g => new { stylist = g.Key, count = g.Count() })
                    .OrderByDescending(x => x.count)
                    .ToListAsync());

            case WidgetTypes.ChartMonthlyAppts:
                return Ok(await _db.Appointments
                    .Where(x => x.SalonId == salonId && x.StartAtUtc >= now.AddMonths(-6))
                    .GroupBy(x => new { x.StartAtUtc.Year, x.StartAtUtc.Month })
                    .Select(g => new { year = g.Key.Year, month = g.Key.Month, count = g.Count() })
                    .OrderBy(x => x.year).ThenBy(x => x.month)
                    .ToListAsync());

            case WidgetTypes.ChartServiceBreakdown:
                return Ok(await _db.Appointments
                    .Where(x => x.SalonId == salonId && x.StartAtUtc >= monthStart)
                    .GroupBy(x => x.ServiceName)
                    .Select(g => new { service = g.Key, count = g.Count() })
                    .OrderByDescending(x => x.count)
                    .Take(10)
                    .ToListAsync());

            case WidgetTypes.KpiPendingRequests:
            {
                var pending  = await _db.AppointmentRequests.CountAsync(x => x.SalonId == salonId && x.Status == "Pending");
                var approved = await _db.AppointmentRequests.CountAsync(x => x.SalonId == salonId && x.Status == "Approved" && x.CreatedAtUtc >= monthStart);
                return Ok(new { value = pending, label = "Bekleyen İstek", thisMonth = approved, lastMonth = 0, trendPct = 0, note = $"Bu ay {approved} onaylandı" });
            }

            case WidgetTypes.ListPendingRequests:
                return Ok(await _db.AppointmentRequests
                    .Include(x => x.Stylist)
                    .Where(x => x.SalonId == salonId && x.Status == "Pending")
                    .OrderBy(x => x.RequestedStartUtc)
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        Customer     = x.CustomerFirstName + " " + x.CustomerLastName,
                        Stylist      = x.Stylist!.FullName,
                        ServiceName  = x.ServiceName,
                        StartAtUtc   = x.RequestedStartUtc,
                        Status       = "Pending",
                    })
                    .ToListAsync());

            default:
                return NotFound(new { message = $"Widget türü bulunamadı: {widgetType}" });
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private async Task<List<DashboardWidget>> SeedDefaultWidgetsAsync(
        Guid userId, Guid salonId, string role)
    {
        var types = WidgetTypes.RoleDefaults.GetValueOrDefault(role)
                    ?? WidgetTypes.RoleDefaults["Resepsiyon"];

        var widgets = types.Select((t, i) => new DashboardWidget
        {
            SalonId    = salonId,
            UserId     = userId,
            WidgetType = t,
            SortOrder  = i,
            Size       = t.StartsWith("chart") ? "large" : t.StartsWith("list") ? "large" : "medium"
        }).ToList();

        _db.DashboardWidgets.AddRange(widgets);
        await _db.SaveChangesAsync();
        return widgets;
    }
}

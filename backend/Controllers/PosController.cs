using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using XCut.Api.Data;
using XCut.Api.Models;
using XCut.Api.Services;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PosController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly IWhatsAppService _whatsapp;

    public PosController(AppDbContext db, IAuditService audit, IWhatsAppService whatsapp)
    {
        _db = db; _audit = audit; _whatsapp = whatsapp;
    }

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // GET api/Pos/init — stilistler + hizmetler
    [HttpGet("init")]
    public async Task<IActionResult> Init()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var stylists = await _db.Stylists
            .Where(s => s.SalonId == salonId.Value && s.IsActive)
            .OrderBy(s => s.FullName)
            .Select(s => new { s.Id, s.FullName, s.Specialty, s.CommissionRate })
            .ToListAsync();

        var services = await _db.Services
            .Where(s => s.SalonId == salonId.Value && s.IsActive)
            .OrderBy(s => s.Category).ThenBy(s => s.Name)
            .Select(s => new { s.Id, s.Name, s.Category, s.Price, s.DurationMinutes })
            .ToListAsync();

        return Ok(new { stylists, services });
    }

    // POST api/Pos/checkout
    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout([FromBody] PosCheckoutRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { message = "En az bir ürün/hizmet eklenmeli." });

        var subtotal = req.Items.Sum(i => i.UnitPrice * i.Quantity);

        decimal discountAmount = req.DiscountType switch
        {
            "percent" => Math.Round(subtotal * req.DiscountValue / 100, 2),
            "fixed"   => Math.Min(req.DiscountValue, subtotal),
            _         => 0,
        };

        var total = subtotal - discountAmount;
        if (total < 0) total = 0;

        decimal cashAmount = req.PaymentMethod switch
        {
            "cash"  => total,
            "mixed" => req.CashAmount,
            _       => 0,
        };
        decimal cardAmount = req.PaymentMethod switch
        {
            "card"  => total,
            "mixed" => req.CardAmount,
            _       => 0,
        };

        decimal bankAmount = req.PaymentMethod switch
        {
            "bank"  => total,
            "mixed" => req.BankAmount,
            _       => 0,
        };

        // Açık kasa oturumu zorunlu — yoksa işlem yapılamaz
        var openSessionId = req.CashSessionId;
        if (openSessionId is null)
        {
            openSessionId = await _db.CashSessions
                .Where(s => s.SalonId == salonId.Value && s.Status == "Open")
                .OrderByDescending(s => s.OpenedAtUtc)
                .Select(s => (Guid?)s.Id)
                .FirstOrDefaultAsync();
        }
        if (openSessionId is null)
            return BadRequest(new { message = "Kasa oturumu açık değil. Ödeme almak için önce oturum açın." });

        // Look up customer name from CustomerId if provided
        string? customerName = req.CustomerName?.Trim();
        if (req.CustomerId.HasValue && string.IsNullOrWhiteSpace(customerName))
        {
            var cust = await _db.Customers.Select(c => new { c.Id, FullName = c.FirstName + " " + c.LastName })
                .FirstOrDefaultAsync(c => c.Id == req.CustomerId.Value);
            customerName = cust?.FullName;
        }

        var tx = new PosTransaction
        {
            SalonId        = salonId.Value,
            StylistId      = req.StylistId,
            CustomerId     = req.CustomerId,
            AppointmentId  = req.AppointmentId,
            CashSessionId  = openSessionId,
            BankAccountId  = req.BankAccountId,
            CustomerName   = customerName,
            Subtotal       = subtotal,
            DiscountType   = req.DiscountType ?? "none",
            DiscountValue  = req.DiscountValue,
            DiscountAmount = discountAmount,
            Total          = total,
            PaymentMethod  = req.PaymentMethod ?? "cash",
            CashAmount     = cashAmount,
            CardAmount     = cardAmount,
            BankAmount     = bankAmount,
            Notes          = req.Notes,
            Status         = "completed",
        };

        foreach (var item in req.Items)
        {
            tx.Items.Add(new PosTransactionItem
            {
                ServiceId    = item.ServiceId,
                StockItemId  = item.StockItemId,
                StaffBonusPct = item.StaffBonusPct,
                Name         = item.Name,
                UnitPrice    = item.UnitPrice,
                Quantity     = item.Quantity,
                LineTotal    = item.UnitPrice * item.Quantity,
            });

            // Reduce stock when selling a stock item
            if (item.StockItemId.HasValue)
            {
                var stockItem = await _db.StockItems
                    .FirstOrDefaultAsync(s => s.Id == item.StockItemId.Value && s.SalonId == salonId.Value);
                if (stockItem is not null)
                {
                    stockItem.Quantity = Math.Max(0, stockItem.Quantity - item.Quantity);
                    _db.StockMovements.Add(new StockMovement
                    {
                        StockItemId = item.StockItemId.Value,
                        Type        = "out",
                        Quantity    = item.Quantity,
                        Note        = $"Kasa satışı #{tx.Id.ToString()[..8]}",
                    });
                }
            }
        }

        _db.PosTransactions.Add(tx);

        // Randevuyu tamamlandı olarak işaretle ve kasa bağlantısını güncelle
        if (req.AppointmentId.HasValue)
        {
            var appt = await _db.Appointments
                .FirstOrDefaultAsync(a => a.Id == req.AppointmentId.Value && a.SalonId == salonId.Value);
            if (appt is not null)
            {
                appt.PosTransactionId = tx.Id;
                if (appt.Status == "Scheduled") appt.Status = "Completed";
                appt.UpdatedAtUtc = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();

        _ = _audit.LogAsync(salonId.Value, null, "PosTransaction", tx.Id.ToString(), "Create",
            $"Kasa işlemi: ₺{tx.Total:F2} — {tx.PaymentMethod}{(tx.CustomerName != null ? $" — {tx.CustomerName}" : "")}");

        _ = SendSurveyAfterCheckoutAsync(salonId.Value, tx);

        // Auto-create invoice for this POS transaction
        var invoiceId = await CreateInvoiceForTransactionAsync(salonId.Value, tx);

        return Ok(new
        {
            tx.Id,
            tx.Total,
            tx.CashAmount,
            tx.CardAmount,
            tx.BankAmount,
            tx.PaymentMethod,
            tx.CreatedAtUtc,
            itemCount = tx.Items.Count,
            invoiceId,
        });
    }

    private async Task<Guid?> CreateInvoiceForTransactionAsync(Guid salonId, PosTransaction tx)
    {
        try
        {
            var count = await _db.Invoices.CountAsync(i => i.SalonId == salonId);
            var invoiceNo = $"INV-{DateTime.UtcNow:yyyy}-{(count + 1):D4}";
            var paymentLabel = tx.PaymentMethod switch
            {
                "cash"  => "Nakit",
                "card"  => "Kredi Kartı",
                "bank"  => "Banka Transferi",
                "mixed" => "Karma Ödeme",
                _       => tx.PaymentMethod,
            };

            var inv = new Invoice
            {
                SalonId          = salonId,
                CustomerId       = tx.CustomerId,
                StylistId        = tx.StylistId,
                PosTransactionId = tx.Id,
                InvoiceNo        = invoiceNo,
                IssuedAtUtc      = tx.CreatedAtUtc,
                Status           = InvoiceStatuses.Paid,
                Currency         = "TRY",
                TaxRate          = 0,
                Notes            = $"Kasa ödemesi — {paymentLabel}{(tx.CustomerName != null ? $" — {tx.CustomerName}" : "")}",
            };

            foreach (var item in tx.Items)
            {
                inv.Items.Add(new InvoiceItem
                {
                    Description = item.Name,
                    Quantity    = item.Quantity,
                    UnitPrice   = item.UnitPrice,
                    LineTotal   = item.LineTotal,
                });
            }

            inv.Subtotal  = tx.Subtotal;
            inv.TaxAmount = 0;
            inv.Total     = tx.Total;

            _db.Invoices.Add(inv);
            await _db.SaveChangesAsync();
            return inv.Id;
        }
        catch
        {
            return null;
        }
    }

    private async Task SendSurveyAfterCheckoutAsync(Guid salonId, PosTransaction tx)
    {
        try
        {
            if (!tx.CustomerId.HasValue) return;

            var customer = await _db.Customers
                .FirstOrDefaultAsync(c => c.Id == tx.CustomerId.Value);
            if (customer is null || string.IsNullOrWhiteSpace(customer.Phone)) return;

            var survey = await _db.Surveys
                .Where(s => s.SalonId == salonId && s.Status == "Active")
                .OrderByDescending(s => s.CreatedAtUtc)
                .FirstOrDefaultAsync();
            if (survey is null) return;

            var firstName = customer.FirstName ?? tx.CustomerName?.Split(' ')[0] ?? "";
            var surveyUrl = $"https://xcut.xshield.com.tr/survey/{survey.Id}";
            var msg = $"Merhaba{(firstName.Length > 0 ? " " + firstName : "")}! Hizmetimizden ne kadar memnun kaldınız? " +
                      $"Görüşleriniz bizim için çok değerli 😊 {surveyUrl}";

            await _whatsapp.SendTextAsync(salonId, customer.Phone, msg,
                customer.Id, "Otomatik", null, "survey");
        }
        catch { /* fire-and-forget — log suppressed intentionally */ }
    }

    // GET api/Pos/monthly-summary?year=2026&month=4
    [HttpGet("monthly-summary")]
    public async Task<IActionResult> MonthlySummary([FromQuery] int year, [FromQuery] int month)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        if (year < 2020 || year > 2100 || month < 1 || month > 12)
            return BadRequest(new { message = "Geçersiz tarih." });

        var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var to   = from.AddMonths(1);

        var txs = await _db.PosTransactions
            .Where(t => t.SalonId == salonId.Value
                     && t.Status == "completed"
                     && t.CreatedAtUtc >= from
                     && t.CreatedAtUtc < to)
            .Include(t => t.Stylist)
            .ToListAsync();

        // Stilist bazlı gruplama
        var stylistRows = txs
            .Where(t => t.StylistId.HasValue)
            .GroupBy(t => t.StylistId!.Value)
            .Select(g =>
            {
                var stylist      = g.First().Stylist;
                var totalSales   = g.Sum(t => t.Total);
                var commRate     = stylist?.CommissionRate ?? 0;
                var netPay       = Math.Round(totalSales * commRate / 100, 2);
                return new
                {
                    stylistId      = g.Key,
                    stylistName    = stylist?.FullName ?? "—",
                    commissionRate = commRate,
                    totalSales,
                    cashSales   = g.Sum(t => t.CashAmount),
                    cardSales   = g.Sum(t => t.CardAmount),
                    txCount     = g.Count(),
                    netPay,
                    salonCut    = Math.Round(totalSales - netPay, 2),
                };
            })
            .OrderByDescending(r => r.totalSales)
            .ToList();

        // Atanmamış (stilist seçilmemiş) işlemler
        var unassigned = txs.Where(t => !t.StylistId.HasValue).ToList();

        return Ok(new
        {
            year, month,
            totalRevenue   = txs.Sum(t => t.Total),
            totalCash      = txs.Sum(t => t.CashAmount),
            totalCard      = txs.Sum(t => t.CardAmount),
            totalBank      = txs.Sum(t => t.BankAmount),
            txCount        = txs.Count,
            stylists       = stylistRows,
            unassignedTotal = unassigned.Sum(t => t.Total),
            unassignedCount = unassigned.Count,
        });
    }

    // GET api/Pos/today
    [HttpGet("today")]
    public async Task<IActionResult> Today()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var todayStart = DateTime.UtcNow.Date;
        var txs = await _db.PosTransactions
            .Where(t => t.SalonId == salonId.Value && t.Status == "completed" && t.CreatedAtUtc >= todayStart)
            .ToListAsync();

        var session = await _db.CashSessions
            .Where(s => s.SalonId == salonId.Value && s.Status == "Open")
            .OrderByDescending(s => s.OpenedAtUtc)
            .Select(s => new { s.Id, s.OpenedAtUtc, s.OpeningBalance })
            .FirstOrDefaultAsync();

        return Ok(new {
            totalRevenue = txs.Sum(t => t.Total),
            totalCash    = txs.Sum(t => t.CashAmount),
            totalCard    = txs.Sum(t => t.CardAmount),
            totalBank    = txs.Sum(t => t.BankAmount),
            txCount      = txs.Count,
            session,
        });
    }

    // GET api/Pos/history?page=1&pageSize=20
    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.PosTransactions
            .Where(t => t.SalonId == salonId.Value)
            .Include(t => t.Stylist)
            .Include(t => t.Items)
            .OrderByDescending(t => t.CreatedAtUtc);

        var total = await q.CountAsync();
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(t => new
            {
                t.Id, t.CustomerName, t.Total, t.PaymentMethod,
                t.CashAmount, t.CardAmount, t.DiscountAmount, t.Status,
                t.CreatedAtUtc,
                stylistName = t.Stylist != null ? t.Stylist.FullName : null,
                itemCount   = t.Items.Count,
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    // PATCH api/Pos/stylists/{id}/commission
    [HttpPatch("stylists/{id:guid}/commission")]
    public async Task<IActionResult> UpdateCommission(Guid id, [FromBody] UpdateCommissionRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var stylist = await _db.Stylists.FirstOrDefaultAsync(s => s.Id == id && s.SalonId == salonId.Value);
        if (stylist is null) return NotFound();

        if (req.CommissionRate < 0 || req.CommissionRate > 100)
            return BadRequest(new { message = "Komisyon oranı 0-100 arasında olmalı." });

        stylist.CommissionRate = req.CommissionRate;
        await _db.SaveChangesAsync();
        return Ok(new { stylist.Id, stylist.CommissionRate });
    }

    // GET api/Pos/from-appointment/{appointmentId}
    [HttpGet("from-appointment/{appointmentId:guid}")]
    public async Task<IActionResult> FromAppointment(Guid appointmentId)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var appt = await _db.Appointments
            .Include(a => a.Customer)
            .Include(a => a.Service)
            .FirstOrDefaultAsync(a => a.Id == appointmentId && a.SalonId == salonId.Value);

        if (appt is null) return NotFound();
        if (appt.PosTransactionId.HasValue)
            return BadRequest(new { message = "Bu randevu zaten kasaya aktarılmış." });

        // If service wasn't linked by ID, try exact name match (handles free-text entries)
        decimal servicePrice = appt.Service?.Price ?? 0m;
        if (servicePrice == 0 && !string.IsNullOrWhiteSpace(appt.ServiceName) && appt.ServiceId is null)
        {
            var svcByName = await _db.Services
                .Where(s => s.SalonId == salonId.Value && s.Name == appt.ServiceName)
                .Select(s => s.Price)
                .FirstOrDefaultAsync();
            servicePrice = svcByName;
        }

        return Ok(new
        {
            appointmentId    = appt.Id,
            customerId       = appt.CustomerId,
            customerFullName = appt.Customer != null
                ? $"{appt.Customer.FirstName} {appt.Customer.LastName}".Trim()
                : null,
            stylistId        = appt.StylistId,
            suggestedItems   = new[]
            {
                new
                {
                    serviceId = appt.ServiceId,
                    name      = appt.ServiceName,
                    unitPrice = servicePrice,
                    quantity  = 1,
                }
            }
        });
    }

    // GET api/Pos/sessions?page=1&pageSize=20
    [HttpGet("sessions")]
    public async Task<IActionResult> GetSessions([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var sessions = await _db.CashSessions
            .Where(s => s.SalonId == salonId.Value)
            .OrderByDescending(s => s.OpenedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync();

        var total = await _db.CashSessions.CountAsync(s => s.SalonId == salonId.Value);

        var result = new List<object>();
        foreach (var s in sessions)
        {
            var txSum = await _db.PosTransactions
                .Where(t => t.CashSessionId == s.Id && t.Status == "completed")
                .GroupBy(_ => 1)
                .Select(g => new { cash = g.Sum(t => t.CashAmount), card = g.Sum(t => t.CardAmount), bank = g.Sum(t => t.BankAmount), revenue = g.Sum(t => t.Total), count = g.Count() })
                .FirstOrDefaultAsync();
            var expSum = await _db.CashExpenses.Where(e => e.CashSessionId == s.Id).SumAsync(e => e.Amount);
            result.Add(new
            {
                s.Id, s.OpenedAtUtc, s.ClosedAtUtc, s.Status,
                s.OpeningBalance, s.ClosingBalance, s.Notes,
                totalRevenue  = txSum?.revenue  ?? 0,
                totalCash     = txSum?.cash     ?? 0,
                totalCard     = txSum?.card     ?? 0,
                totalBank     = txSum?.bank     ?? 0,
                totalExpenses = expSum,
                txCount       = txSum?.count    ?? 0,
                netCash       = s.OpeningBalance + (txSum?.cash ?? 0) - expSum,
                difference    = s.ClosingBalance.HasValue
                    ? s.ClosingBalance.Value - (s.OpeningBalance + (txSum?.cash ?? 0) - expSum)
                    : (decimal?)null,
            });
        }
        return Ok(new { total, page, pageSize, items = result });
    }

    // GET api/Pos/session/current
    [HttpGet("session/current")]
    public async Task<IActionResult> GetCurrentSession()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var session = await _db.CashSessions
            .Where(s => s.SalonId == salonId.Value && s.Status == "Open")
            .OrderByDescending(s => s.OpenedAtUtc)
            .FirstOrDefaultAsync();

        if (session is null) return Ok(null);

        var txSum = await _db.PosTransactions
            .Where(t => t.CashSessionId == session.Id && t.Status == "completed")
            .GroupBy(_ => 1)
            .Select(g => new { cash = g.Sum(t => t.CashAmount), card = g.Sum(t => t.CardAmount), bank = g.Sum(t => t.BankAmount), total = g.Sum(t => t.Total) })
            .FirstOrDefaultAsync();

        var expSum = await _db.CashExpenses
            .Where(e => e.CashSessionId == session.Id)
            .SumAsync(e => e.Amount);

        return Ok(new
        {
            session.Id,
            session.OpenedAtUtc,
            session.OpeningBalance,
            session.Status,
            totalRevenue  = txSum?.total ?? 0,
            totalCash     = txSum?.cash  ?? 0,
            totalCard     = txSum?.card  ?? 0,
            totalBank     = txSum?.bank  ?? 0,
            totalExpenses = expSum,
            netCash       = (session.OpeningBalance + (txSum?.cash ?? 0)) - expSum,
        });
    }

    // POST api/Pos/session/open
    [HttpPost("session/open")]
    public async Task<IActionResult> OpenSession([FromBody] OpenSessionRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var existing = await _db.CashSessions
            .AnyAsync(s => s.SalonId == salonId.Value && s.Status == "Open");
        if (existing) return BadRequest(new { message = "Zaten açık bir kasa oturumu var." });

        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();

        var session = new CashSession
        {
            SalonId        = salonId.Value,
            OpenedByUserId = userId,
            OpeningBalance = req.OpeningBalance,
            Notes          = req.Notes,
        };
        _db.CashSessions.Add(session);
        await _db.SaveChangesAsync();
        return Ok(new { session.Id, session.OpenedAtUtc, session.OpeningBalance });
    }

    // POST api/Pos/session/{id}/close
    [HttpPost("session/{id:guid}/close")]
    public async Task<IActionResult> CloseSession(Guid id, [FromBody] CloseSessionRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var session = await _db.CashSessions
            .FirstOrDefaultAsync(s => s.Id == id && s.SalonId == salonId.Value && s.Status == "Open");
        if (session is null) return NotFound(new { message = "Açık oturum bulunamadı." });

        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();

        var txs = await _db.PosTransactions
            .Where(t => t.CashSessionId == id && t.Status == "completed")
            .ToListAsync();

        var expenses = await _db.CashExpenses
            .Where(e => e.CashSessionId == id)
            .ToListAsync();

        var totalCash = txs.Sum(t => t.CashAmount);
        var totalCard = txs.Sum(t => t.CardAmount);
        var totalBank = txs.Sum(t => t.BankAmount);
        var totalRevenue  = txs.Sum(t => t.Total);
        var totalExpenses = expenses.Sum(e => e.Amount);
        var netCash       = session.OpeningBalance + totalCash - totalExpenses;

        session.ClosedByUserId = userId;
        session.ClosedAtUtc    = DateTime.UtcNow;
        session.ClosingBalance = req.ClosingBalance ?? netCash;
        session.Status         = "Closed";
        session.Notes          = req.Notes ?? session.Notes;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            session.Id,
            session.OpenedAtUtc,
            session.ClosedAtUtc,
            session.OpeningBalance,
            session.ClosingBalance,
            totalRevenue,
            totalCash,
            totalCard,
            totalBank,
            totalExpenses,
            netCash,
            txCount      = txs.Count,
            expenseCount = expenses.Count,
        });
    }

    // GET api/Pos/expenses?sessionId=&page=1
    [HttpGet("expenses")]
    public async Task<IActionResult> GetExpenses([FromQuery] Guid? sessionId, [FromQuery] int page = 1, [FromQuery] int pageSize = 30)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var q = _db.CashExpenses
            .Where(e => e.SalonId == salonId.Value)
            .AsQueryable();

        if (sessionId.HasValue) q = q.Where(e => e.CashSessionId == sessionId.Value);

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(e => e.CreatedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new
            {
                e.Id, e.Description, e.Category, e.Amount,
                e.PaymentMethod, e.BankAccountId, e.Notes,
                e.CashSessionId, e.CreatedAtUtc,
                bankName = e.BankAccount != null ? e.BankAccount.BankName : null,
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    // POST api/Pos/expenses
    [HttpPost("expenses")]
    public async Task<IActionResult> AddExpense([FromBody] AddExpenseRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue("sub");
        Guid.TryParse(sub, out var userId);

        // Açık oturuma otomatik bağla
        var openSession = await _db.CashSessions
            .Where(s => s.SalonId == salonId.Value && s.Status == "Open")
            .OrderByDescending(s => s.OpenedAtUtc)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync();

        var expense = new CashExpense
        {
            SalonId          = salonId.Value,
            CashSessionId    = openSession,
            Description      = req.Description,
            Category         = req.Category ?? "Genel",
            Amount           = req.Amount,
            PaymentMethod    = req.PaymentMethod ?? "cash",
            BankAccountId    = req.BankAccountId,
            CreatedByUserId  = userId == Guid.Empty ? null : userId,
            Notes            = req.Notes,
        };

        _db.CashExpenses.Add(expense);
        await _db.SaveChangesAsync();
        return Ok(new { expense.Id, expense.Amount, expense.Category, expense.CreatedAtUtc });
    }

    // DELETE api/Pos/expenses/{id}
    [HttpDelete("expenses/{id:guid}")]
    public async Task<IActionResult> DeleteExpense(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var expense = await _db.CashExpenses
            .FirstOrDefaultAsync(e => e.Id == id && e.SalonId == salonId.Value);
        if (expense is null) return NotFound();

        _db.CashExpenses.Remove(expense);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record PosCheckoutRequest(
    Guid?   StylistId,
    Guid?   CustomerId,
    string? CustomerName,
    Guid?   AppointmentId,
    Guid?   CashSessionId,
    Guid?   BankAccountId,
    List<PosItemRequest> Items,
    string? DiscountType,
    decimal DiscountValue,
    string? PaymentMethod,
    decimal CashAmount,
    decimal CardAmount,
    decimal BankAmount,
    string? Notes
);

public record PosItemRequest(
    Guid?   ServiceId,
    Guid?   StockItemId,
    decimal StaffBonusPct,
    string  Name,
    decimal UnitPrice,
    int     Quantity
);

public record UpdateCommissionRequest(decimal CommissionRate);
public record OpenSessionRequest(decimal OpeningBalance, string? Notes);
public record CloseSessionRequest(decimal? ClosingBalance, string? Notes);
public record AddExpenseRequest(
    string  Description,
    string? Category,
    decimal Amount,
    string? PaymentMethod,
    Guid?   BankAccountId,
    string? Notes
);

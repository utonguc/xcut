namespace XCut.Api.Models;

// ── User / Auth ───────────────────────────────────────────────────────────────

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SalonId { get; set; }
    public Salon? Salon { get; set; }

    public string FullName { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Guid? RoleId { get; set; }
    public Role? Role { get; set; }

    public string? ProfilePhotoUrl { get; set; }
}

public class Role
{
    public Guid   Id   { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
}

public class Permission
{
    public Guid   Id          { get; set; } = Guid.NewGuid();
    public string Code        { get; set; } = string.Empty;
    public string? Description { get; set; }
}

// ── Invoice / Finance ─────────────────────────────────────────────────────────

public class Invoice
{
    public Guid   Id       { get; set; } = Guid.NewGuid();
    public Guid   SalonId  { get; set; }
    public Salon? Salon    { get; set; }

    public Guid      CustomerId { get; set; }
    public Customer? Customer   { get; set; }

    public Guid?    StylistId { get; set; }
    public Stylist? Stylist   { get; set; }

    public string InvoiceNo   { get; set; } = string.Empty;
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DueAtUtc  { get; set; }

    public string  Status   { get; set; } = InvoiceStatuses.Draft;
    public string  Currency { get; set; } = "TRY";

    public decimal Subtotal  { get; set; }
    public decimal TaxRate   { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal Total     { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
}

public class InvoiceItem
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    InvoiceId   { get; set; }
    public Invoice? Invoice    { get; set; }

    public string  Description { get; set; } = string.Empty;
    public int     Quantity    { get; set; } = 1;
    public decimal UnitPrice   { get; set; }
    public decimal LineTotal   { get; set; }
}

public static class InvoiceStatuses
{
    public const string Draft     = "Draft";
    public const string Sent      = "Sent";
    public const string Paid      = "Paid";
    public const string Overdue   = "Overdue";
    public const string Cancelled = "Cancelled";

    public static readonly string[] All = [Draft, Sent, Paid, Overdue, Cancelled];
}

// ── Notification ──────────────────────────────────────────────────────────────

public class Notification
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    SalonId     { get; set; }
    public Guid    UserId      { get; set; }
    public User?   User        { get; set; }
    public string  Title       { get; set; } = string.Empty;
    public string  Message     { get; set; } = string.Empty;
    public string  Type        { get; set; } = "info"; // info | success | warning | error
    public string? Link        { get; set; }
    public bool    IsRead      { get; set; } = false;
    public string? DedupeKey   { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── Stock ─────────────────────────────────────────────────────────────────────

public class StockItem
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    SalonId     { get; set; }
    public string  Name        { get; set; } = string.Empty;
    public string? Category    { get; set; }
    public string? Unit        { get; set; }
    public string? Barcode     { get; set; }
    public string? Supplier    { get; set; }
    public decimal UnitCost    { get; set; }
    public int     Quantity    { get; set; }
    public int     MinQuantity { get; set; } = 5;
    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<StockMovement> Movements { get; set; } = new List<StockMovement>();
}

public class StockMovement
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    StockItemId { get; set; }
    public StockItem? StockItem { get; set; }
    public string  Type        { get; set; } = "in"; // in | out | adjust
    public int     Quantity    { get; set; }
    public string? Note        { get; set; }
    public Guid?   UserId      { get; set; }
    public User?   User        { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── Organization Settings ─────────────────────────────────────────────────────

public class OrganizationSetting
{
    public Guid    Id               { get; set; } = Guid.NewGuid();
    public Guid    SalonId          { get; set; }
    public string  CompanyName      { get; set; } = "Salon";
    public string  ApplicationTitle { get; set; } = "xCut";
    public string? LogoUrl          { get; set; }
    public string  PrimaryColor     { get; set; } = "#1d4ed8";
    public DateTime UpdatedAtUtc    { get; set; } = DateTime.UtcNow;
}

// ── Dashboard Widget ──────────────────────────────────────────────────────────

public class DashboardWidget
{
    public Guid   Id         { get; set; } = Guid.NewGuid();
    public Guid   SalonId    { get; set; }
    public Guid   UserId     { get; set; }
    public User?  User       { get; set; }
    public string WidgetType { get; set; } = string.Empty;
    public int    SortOrder  { get; set; }
    public string Size       { get; set; } = "medium";
    public string? Config    { get; set; }
}

public static class WidgetTypes
{
    public const string KpiCustomers       = "kpi_customers";
    public const string KpiStylists        = "kpi_stylists";
    public const string KpiAppointments    = "kpi_appointments";
    public const string KpiRevenue         = "kpi_revenue";
    public const string CalendarUpcoming   = "calendar_upcoming";
    public const string ListLatestAppts    = "list_latest_appts";
    public const string ChartStylistLoad   = "chart_stylist_load";
    public const string ChartMonthlyAppts  = "chart_monthly_appts";
    public const string ChartServiceBreakdown = "chart_service_breakdown";
    public const string KpiPendingRequests = "kpi_pending_requests";
    public const string ListPendingRequests = "list_pending_requests";

    public static readonly Dictionary<string, string> Labels = new()
    {
        [KpiCustomers]           = "Toplam Müşteri",
        [KpiStylists]            = "Aktif Stilist",
        [KpiAppointments]        = "Toplam Randevu",
        [KpiRevenue]             = "Bu Ay Gelir",
        [CalendarUpcoming]       = "Yaklaşan Randevular",
        [ListLatestAppts]        = "Son Randevular",
        [ChartStylistLoad]       = "Stilist Yük Grafiği",
        [ChartMonthlyAppts]      = "Aylık Randevu",
        [ChartServiceBreakdown]  = "Hizmet Dağılımı",
        [KpiPendingRequests]     = "Bekleyen İstek",
        [ListPendingRequests]    = "Bekleyen İstekler Listesi",
    };

    public static readonly Dictionary<string, string[]> RoleDefaults = new()
    {
        ["SuperAdmin"]       = [KpiCustomers, KpiStylists, KpiAppointments, KpiRevenue, CalendarUpcoming, ChartMonthlyAppts],
        ["SalonYonetici"]    = [KpiCustomers, KpiStylists, KpiAppointments, KpiRevenue, CalendarUpcoming, ChartStylistLoad, ChartMonthlyAppts],
        ["Stilist"]          = [KpiAppointments, CalendarUpcoming, ListLatestAppts],
        ["Kasiyer"]          = [KpiRevenue, KpiAppointments, ListLatestAppts],
        ["Resepsiyon"]       = [KpiAppointments, KpiPendingRequests, CalendarUpcoming, ListPendingRequests],
    };
}

// ── Task Management ───────────────────────────────────────────────────────────

public class TaskItem
{
    public Guid    Id           { get; set; } = Guid.NewGuid();
    public Guid    SalonId      { get; set; }
    public string  Title        { get; set; } = string.Empty;
    public string? Description  { get; set; }
    public string  Status       { get; set; } = "Todo"; // Todo | InProgress | Done
    public string  Priority     { get; set; } = "Medium"; // Low | Medium | High
    public Guid?   AssignedToId { get; set; }
    public User?   AssignedTo   { get; set; }
    public Guid?   CreatedById  { get; set; }
    public User?   CreatedBy    { get; set; }
    public DateTime? DueAtUtc   { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── Document ──────────────────────────────────────────────────────────────────

public class Document
{
    public Guid    Id            { get; set; } = Guid.NewGuid();
    public Guid    SalonId       { get; set; }
    public string  OriginalName  { get; set; } = string.Empty;
    public string  StoredName    { get; set; } = string.Empty;
    public string  Category      { get; set; } = "Diğer";
    public string? Description   { get; set; }
    public string  MimeType      { get; set; } = string.Empty;
    public long    FileSize      { get; set; }
    public Guid?   CustomerId    { get; set; }
    public Customer? Customer    { get; set; }
    public Guid?   UploadedById  { get; set; }
    public User?   UploadedBy    { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

public class AuditLog
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    SalonId     { get; set; }
    public Guid?   UserId      { get; set; }
    public User?   User        { get; set; }
    public string  EntityType  { get; set; } = string.Empty;
    public string  EntityId    { get; set; } = string.Empty;
    public string  Action      { get; set; } = string.Empty;
    public string  Description { get; set; } = string.Empty;
    public string? ChangesJson { get; set; }
    public string? IpAddress   { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

public class WhatsAppSetting
{
    public Guid    Id            { get; set; } = Guid.NewGuid();
    public Guid    SalonId       { get; set; }
    public Salon?  Salon         { get; set; }
    public bool    IsActive      { get; set; } = false;
    public string? ApiToken      { get; set; }
    public string? PhoneNumberId { get; set; }
    public string? FromNumber    { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class WhatsAppLog
{
    public Guid    Id            { get; set; } = Guid.NewGuid();
    public Guid    SalonId       { get; set; }
    public string  ToNumber      { get; set; } = string.Empty;
    public string  MessageBody   { get; set; } = string.Empty;
    public string  Status        { get; set; } = "pending"; // pending | sent | failed
    public string? ErrorDetail   { get; set; }
    public Guid?   CustomerId    { get; set; }
    public Customer? Customer    { get; set; }
    public string? SentByName    { get; set; }
    public Guid?   AppointmentId { get; set; }
    public string? MessageType   { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── Survey / Anket ────────────────────────────────────────────────────────────

public class Survey
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    SalonId     { get; set; }
    public Salon?  Salon       { get; set; }
    public string  Title       { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string  Status      { get; set; } = "Active"; // Active | Closed
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<SurveyQuestion> Questions  { get; set; } = new List<SurveyQuestion>();
    public ICollection<SurveyResponse> Responses  { get; set; } = new List<SurveyResponse>();
}

public class SurveyQuestion
{
    public Guid   Id         { get; set; } = Guid.NewGuid();
    public Guid   SurveyId   { get; set; }
    public Survey? Survey    { get; set; }
    public int    SortOrder  { get; set; } = 1;
    public string Text       { get; set; } = string.Empty;
    public string Type       { get; set; } = "rating"; // rating | yesno | choice | text
    public string? Options   { get; set; }
    public bool   IsRequired { get; set; } = true;

    public ICollection<SurveyAnswer> Answers { get; set; } = new List<SurveyAnswer>();
}

public class SurveyResponse
{
    public Guid    Id             { get; set; } = Guid.NewGuid();
    public Guid    SurveyId       { get; set; }
    public Survey? Survey         { get; set; }
    public Guid?   CustomerId     { get; set; }
    public Customer? Customer     { get; set; }
    public string? CustomerName   { get; set; }
    public string? Email          { get; set; }
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<SurveyAnswer> Answers { get; set; } = new List<SurveyAnswer>();
}

public class SurveyAnswer
{
    public Guid            Id         { get; set; } = Guid.NewGuid();
    public Guid            ResponseId { get; set; }
    public SurveyResponse? Response   { get; set; }
    public Guid            QuestionId { get; set; }
    public SurveyQuestion? Question   { get; set; }
    public string?         Value      { get; set; }
}

// ── Appointment Request (online randevu talebi) ───────────────────────────────

public static class AppointmentRequestStatuses
{
    public const string Pending  = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

public class AppointmentRequest
{
    public Guid     Id              { get; set; } = Guid.NewGuid();
    public Guid     SalonId         { get; set; }
    public Guid     StylistId       { get; set; }

    public DateTime RequestedStartUtc { get; set; }
    public DateTime RequestedEndUtc   { get; set; }
    public string   ServiceName     { get; set; } = string.Empty;

    // Customer info (anonymous, no account needed)
    public string   CustomerFirstName { get; set; } = string.Empty;
    public string   CustomerLastName  { get; set; } = string.Empty;
    public string?  CustomerPhone     { get; set; }
    public string?  CustomerEmail     { get; set; }
    public string?  CustomerNotes     { get; set; }

    public string   Status           { get; set; } = AppointmentRequestStatuses.Pending;
    public string?  RejectionReason  { get; set; }
    public Guid?    ReviewedByUserId { get; set; }
    public DateTime? ReviewedAtUtc   { get; set; }
    public Guid?    CreatedAppointmentId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Salon?   Salon   { get; set; }
    public Stylist? Stylist { get; set; }
}

// ── Module License ────────────────────────────────────────────────────────────

public class ModuleLicense
{
    public Guid   Id         { get; set; } = Guid.NewGuid();
    public Guid   SalonId    { get; set; }
    public string ModuleCode { get; set; } = string.Empty;
    public bool   IsActive   { get; set; } = true;
    public DateTime? ExpiresAtUtc { get; set; }
}

// ── Customer Account (müşteri portal girişi) ──────────────────────────────────

public class CustomerAccount
{
    public Guid      Id           { get; set; } = Guid.NewGuid();
    public Guid      CustomerId   { get; set; }
    public Customer? Customer     { get; set; }
    public Guid      SalonId      { get; set; }
    public string    Email        { get; set; } = string.Empty;
    public string    PasswordHash { get; set; } = string.Empty;
    public bool      IsActive     { get; set; } = true;
    public DateTime  CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginUtc { get; set; }
}

// ── Platform Announcements ────────────────────────────────────────────────────

public class PlatformAnnouncement
{
    public Guid      Id           { get; set; } = Guid.NewGuid();
    public string    Title        { get; set; } = string.Empty;
    public string    Body         { get; set; } = string.Empty;
    public string    Type         { get; set; } = "info";
    public bool      IsPublished  { get; set; } = true;
    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime  CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<PlatformAnnouncementRead> Reads { get; set; } = new List<PlatformAnnouncementRead>();
}

public class PlatformAnnouncementRead
{
    public Guid     Id             { get; set; } = Guid.NewGuid();
    public Guid     AnnouncementId { get; set; }
    public PlatformAnnouncement? Announcement { get; set; }
    public Guid     SalonId        { get; set; }
    public DateTime ReadAtUtc      { get; set; } = DateTime.UtcNow;
}

// ── Support Tickets ───────────────────────────────────────────────────────────

public class SupportTicket
{
    public Guid   Id         { get; set; } = Guid.NewGuid();
    public Guid   SalonId    { get; set; }
    public string SalonName  { get; set; } = string.Empty;
    public string Subject    { get; set; } = string.Empty;
    public string Body       { get; set; } = string.Empty;
    public string? PageUrl   { get; set; }
    public string  Status    { get; set; } = "Open"; // Open | InProgress | Resolved | Closed
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<SupportTicketReply> Replies { get; set; } = new List<SupportTicketReply>();
}

public class SupportTicketReply
{
    public Guid    Id          { get; set; } = Guid.NewGuid();
    public Guid    TicketId    { get; set; }
    public SupportTicket? Ticket { get; set; }
    public string  Body        { get; set; } = string.Empty;
    public bool    IsFromAdmin { get; set; } = false;
    public string  AuthorName  { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// ── Asset / Demirbaş ─────────────────────────────────────────────────────────

public class Asset
{
    public Guid    Id                { get; set; } = Guid.NewGuid();
    public Guid    SalonId           { get; set; }
    public string  Name              { get; set; } = string.Empty;
    public string? Category          { get; set; }
    public string? Brand             { get; set; }
    public string? Model             { get; set; }
    public string? SerialNo          { get; set; }
    public string  Status            { get; set; } = "Active";
    public string? Location          { get; set; }
    public decimal? PurchasePrice    { get; set; }
    public DateTime? PurchasedAt     { get; set; }
    public DateTime? WarrantyUntil   { get; set; }
    public DateTime? NextMaintenanceAt { get; set; }
    public string?  Notes            { get; set; }
    public DateTime CreatedAtUtc     { get; set; } = DateTime.UtcNow;
}

// ── Scheduled Report ──────────────────────────────────────────────────────────

public class ScheduledReport
{
    public Guid    Id              { get; set; } = Guid.NewGuid();
    public Guid    SalonId         { get; set; }
    public string  Name            { get; set; } = string.Empty;
    public string  ReportType      { get; set; } = string.Empty;
    public string  Frequency       { get; set; } = "weekly"; // daily | weekly | monthly
    public string? RecipientEmails { get; set; }
    public bool    IsActive        { get; set; } = true;
    public DateTime? LastSentAtUtc { get; set; }
    public DateTime? NextRunAtUtc  { get; set; }
    public DateTime CreatedAtUtc   { get; set; } = DateTime.UtcNow;
}

using XCut.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Salon>            Salons            => Set<Salon>();
    public DbSet<User>             Users             => Set<User>();
    public DbSet<Role>             Roles             => Set<Role>();
    public DbSet<Permission>       Permissions       => Set<Permission>();
    public DbSet<Customer>         Customers         => Set<Customer>();
    public DbSet<Stylist>          Stylists          => Set<Stylist>();
    public DbSet<Appointment>      Appointments      => Set<Appointment>();
    public DbSet<Service>          Services          => Set<Service>();
    public DbSet<OrganizationSetting> OrganizationSettings => Set<OrganizationSetting>();
    public DbSet<DashboardWidget>  DashboardWidgets  => Set<DashboardWidget>();
    public DbSet<ScheduledReport>  ScheduledReports  => Set<ScheduledReport>();
    public DbSet<ModuleLicense>    ModuleLicenses    => Set<ModuleLicense>();
    public DbSet<Invoice>          Invoices          => Set<Invoice>();
    public DbSet<InvoiceItem>      InvoiceItems      => Set<InvoiceItem>();
    public DbSet<TaskItem>         Tasks             => Set<TaskItem>();
    public DbSet<Document>         Documents         => Set<Document>();
    public DbSet<Notification>     Notifications     => Set<Notification>();
    public DbSet<StockItem>        StockItems        => Set<StockItem>();
    public DbSet<StockMovement>    StockMovements    => Set<StockMovement>();
    public DbSet<Asset>            Assets            => Set<Asset>();
    public DbSet<StylistSchedule>  StylistSchedules  => Set<StylistSchedule>();
    public DbSet<StylistLeave>     StylistLeaves     => Set<StylistLeave>();
    public DbSet<AppointmentRequest> AppointmentRequests => Set<AppointmentRequest>();
    public DbSet<SalonWebsite>     SalonWebsites     => Set<SalonWebsite>();
    public DbSet<WhatsAppSetting>  WhatsAppSettings  => Set<WhatsAppSetting>();
    public DbSet<WhatsAppLog>      WhatsAppLogs      => Set<WhatsAppLog>();
    public DbSet<Survey>           Surveys           => Set<Survey>();
    public DbSet<SurveyQuestion>   SurveyQuestions   => Set<SurveyQuestion>();
    public DbSet<SurveyResponse>   SurveyResponses   => Set<SurveyResponse>();
    public DbSet<SurveyAnswer>     SurveyAnswers     => Set<SurveyAnswer>();
    public DbSet<AuditLog>         AuditLogs         => Set<AuditLog>();
    public DbSet<CustomerAccount>  CustomerAccounts  => Set<CustomerAccount>();
    public DbSet<PlatformAnnouncement>     PlatformAnnouncements     => Set<PlatformAnnouncement>();
    public DbSet<PlatformAnnouncementRead> PlatformAnnouncementReads => Set<PlatformAnnouncementRead>();
    public DbSet<SupportTicket>    SupportTickets    => Set<SupportTicket>();
    public DbSet<SupportTicketReply> SupportTicketReplies => Set<SupportTicketReply>();
    public DbSet<PosTransaction>     PosTransactions     => Set<PosTransaction>();
    public DbSet<PosTransactionItem> PosTransactionItems => Set<PosTransactionItem>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        // ── Salon ─────────────────────────────────────────────────────────────
        m.Entity<Salon>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.Country).HasMaxLength(100);
            e.Property(x => x.EmailDomain).HasMaxLength(200);
            e.HasIndex(x => x.Name);
            e.HasIndex(x => x.EmailDomain).IsUnique().HasFilter("\"EmailDomain\" IS NOT NULL");
        });

        // ── User ──────────────────────────────────────────────────────────────
        m.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.SalonId, x.UserName }).IsUnique();
            e.HasIndex(x => new { x.SalonId, x.Email }).IsUnique();
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.UserName).HasMaxLength(100).IsRequired();
            e.Property(x => x.Email).HasMaxLength(200).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
            e.HasOne(x => x.Salon)
                .WithMany(x => x.Users)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Role ──────────────────────────────────────────────────────────────
        m.Entity<Role>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Name).IsUnique();
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
        });

        // ── Permission ────────────────────────────────────────────────────────
        m.Entity<Permission>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Code).IsUnique();
            e.Property(x => x.Code).HasMaxLength(150).IsRequired();
            e.Property(x => x.Description).HasMaxLength(250);
        });

        // ── Customer ──────────────────────────────────────────────────────────
        m.Entity<Customer>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            e.Property(x => x.LastName).HasMaxLength(100).IsRequired();
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(150);
            e.Property(x => x.Gender).HasMaxLength(20);
            e.Property(x => x.Country).HasMaxLength(100);
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.PreferredService).HasMaxLength(200);
            e.Property(x => x.CustomerStatus).HasMaxLength(50).IsRequired()
                .HasDefaultValue("Yeni");
            e.Property(x => x.StyleNotes).HasMaxLength(2000);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.CustomerStatus });
        });

        // ── Stylist ───────────────────────────────────────────────────────────
        m.Entity<Stylist>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Specialty).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(150);
            e.Property(x => x.PhotoUrl).HasMaxLength(1000);
            e.Property(x => x.Biography).HasMaxLength(2000);
            e.Property(x => x.Specializations).HasMaxLength(500);
            e.Property(x => x.Certificates).HasMaxLength(500);
            e.HasIndex(x => new { x.SalonId, x.FullName });
        });

        // ── Service ───────────────────────────────────────────────────────────
        m.Entity<Service>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100).IsRequired();
            e.Property(x => x.Price).HasColumnType("numeric(18,2)");
            e.HasOne(x => x.Salon)
                .WithMany(x => x.Services)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.Category });
        });

        // ── Appointment ───────────────────────────────────────────────────────
        m.Entity<Appointment>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ServiceName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired()
                .HasDefaultValue("Scheduled");
            e.HasOne(x => x.Customer)
                .WithMany(x => x.Appointments)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Stylist)
                .WithMany(x => x.Appointments)
                .HasForeignKey(x => x.StylistId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Service)
                .WithMany()
                .HasForeignKey(x => x.ServiceId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.StylistId, x.StartAtUtc });
            e.HasIndex(x => new { x.SalonId, x.Status });
        });

        // ── OrganizationSetting ───────────────────────────────────────────────
        m.Entity<OrganizationSetting>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.CompanyName).HasMaxLength(200).IsRequired();
            e.Property(x => x.ApplicationTitle).HasMaxLength(200).IsRequired();
            e.Property(x => x.LogoUrl).HasMaxLength(1000);
            e.Property(x => x.PrimaryColor).HasMaxLength(20).IsRequired();
            e.HasIndex(x => x.SalonId).IsUnique();
        });

        // ── DashboardWidget ───────────────────────────────────────────────────
        m.Entity<DashboardWidget>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.WidgetType).HasMaxLength(80).IsRequired();
            e.Property(x => x.Size).HasMaxLength(20).IsRequired()
                .HasDefaultValue("medium");
            e.Property(x => x.Config).HasMaxLength(2000);
            e.HasIndex(x => new { x.SalonId, x.UserId });
            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── ScheduledReport ───────────────────────────────────────────────────
        m.Entity<ScheduledReport>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.ReportType).HasMaxLength(80).IsRequired();
            e.Property(x => x.Frequency).HasMaxLength(20).IsRequired();
            e.Property(x => x.RecipientEmails).HasMaxLength(1000);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.IsActive, x.NextRunAtUtc });
        });

        // ── ModuleLicense ─────────────────────────────────────────────────────
        m.Entity<ModuleLicense>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ModuleCode).HasMaxLength(50).IsRequired();
            e.HasIndex(x => new { x.SalonId, x.ModuleCode }).IsUnique();
        });

        // ── Invoice ───────────────────────────────────────────────────────────
        m.Entity<Invoice>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.InvoiceNo).HasMaxLength(50).IsRequired();
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("Draft");
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired().HasDefaultValue("TRY");
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Subtotal).HasColumnType("numeric(18,2)");
            e.Property(x => x.TaxRate).HasColumnType("numeric(5,2)");
            e.Property(x => x.TaxAmount).HasColumnType("numeric(18,2)");
            e.Property(x => x.Total).HasColumnType("numeric(18,2)");
            e.HasOne(x => x.Customer).WithMany()
                .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Stylist).WithMany()
                .HasForeignKey(x => x.StylistId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.Status });
        });

        // ── InvoiceItem ───────────────────────────────────────────────────────
        m.Entity<InvoiceItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Description).HasMaxLength(300).IsRequired();
            e.Property(x => x.UnitPrice).HasColumnType("numeric(18,2)");
            e.Property(x => x.LineTotal).HasColumnType("numeric(18,2)");
            e.HasOne(x => x.Invoice).WithMany(x => x.Items)
                .HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── TaskItem ──────────────────────────────────────────────────────────
        m.Entity<TaskItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(300).IsRequired();
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("Todo");
            e.Property(x => x.Priority).HasMaxLength(20).IsRequired().HasDefaultValue("Medium");
            e.HasOne(x => x.AssignedTo).WithMany()
                .HasForeignKey(x => x.AssignedToId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.CreatedBy).WithMany()
                .HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.Status });
        });

        // ── Document ──────────────────────────────────────────────────────────
        m.Entity<Document>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.OriginalName).HasMaxLength(500).IsRequired();
            e.Property(x => x.StoredName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Category).HasMaxLength(50).IsRequired().HasDefaultValue("Diğer");
            e.Property(x => x.Description).HasMaxLength(500);
            e.Property(x => x.MimeType).HasMaxLength(100).IsRequired();
            e.HasOne(x => x.Customer).WithMany()
                .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UploadedBy).WithMany()
                .HasForeignKey(x => x.UploadedById).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.CustomerId });
        });

        // ── Notification ──────────────────────────────────────────────────────
        m.Entity<Notification>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Message).HasMaxLength(1000).IsRequired();
            e.Property(x => x.Type).HasMaxLength(20).IsRequired().HasDefaultValue("info");
            e.Property(x => x.Link).HasMaxLength(200);
            e.Property(x => x.DedupeKey).HasMaxLength(200);
            e.HasOne(x => x.User).WithMany()
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.IsRead });
            e.HasIndex(x => x.SalonId);
        });

        // ── Asset ─────────────────────────────────────────────────────────────
        m.Entity<Asset>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(300).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100);
            e.Property(x => x.Brand).HasMaxLength(100);
            e.Property(x => x.Model).HasMaxLength(100);
            e.Property(x => x.SerialNo).HasMaxLength(100);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("Active");
            e.Property(x => x.Location).HasMaxLength(200);
            e.Property(x => x.PurchasePrice).HasColumnType("numeric(18,2)");
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.Status });
        });

        // ── StylistSchedule ───────────────────────────────────────────────────
        m.Entity<StylistSchedule>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Stylist).WithMany()
                .HasForeignKey(x => x.StylistId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Salon).WithMany()
                .HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.StylistId, x.DayOfWeek });
        });

        m.Entity<StylistLeave>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Reason).HasMaxLength(300);
            e.HasOne(x => x.Stylist).WithMany()
                .HasForeignKey(x => x.StylistId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Salon).WithMany()
                .HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.StylistId, x.StartAtUtc });
        });

        // ── AppointmentRequest ────────────────────────────────────────────────
        m.Entity<AppointmentRequest>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ServiceName).HasMaxLength(200).IsRequired();
            e.Property(x => x.CustomerFirstName).HasMaxLength(100).IsRequired();
            e.Property(x => x.CustomerLastName).HasMaxLength(100).IsRequired();
            e.Property(x => x.CustomerPhone).HasMaxLength(30);
            e.Property(x => x.CustomerEmail).HasMaxLength(150);
            e.Property(x => x.CustomerNotes).HasMaxLength(1000);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("Pending");
            e.Property(x => x.RejectionReason).HasMaxLength(500);
            e.HasOne(x => x.Stylist).WithMany()
                .HasForeignKey(x => x.StylistId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Salon).WithMany()
                .HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.SalonId, x.Status });
        });

        // ── SalonWebsite ──────────────────────────────────────────────────────
        m.Entity<SalonWebsite>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Slug).HasMaxLength(100).IsRequired();
            e.Property(x => x.CustomDomain).HasMaxLength(200);
            e.Property(x => x.HeroTitle).HasMaxLength(200);
            e.Property(x => x.HeroSubtitle).HasMaxLength(500);
            e.Property(x => x.HeroImageUrl).HasMaxLength(500);
            e.Property(x => x.AboutText).HasMaxLength(3000);
            e.Property(x => x.Address).HasMaxLength(300);
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(150);
            e.Property(x => x.GoogleMapsUrl).HasMaxLength(500);
            e.Property(x => x.InstagramUrl).HasMaxLength(200);
            e.Property(x => x.FacebookUrl).HasMaxLength(200);
            e.Property(x => x.WhatsAppNumber).HasMaxLength(30);
            e.Property(x => x.PrimaryColor).HasMaxLength(20);
            e.Property(x => x.Theme).HasMaxLength(30);
            e.Property(x => x.MetaTitle).HasMaxLength(200);
            e.Property(x => x.MetaDescription).HasMaxLength(500);
            e.Property(x => x.MetaKeywords).HasMaxLength(300);
            e.HasOne(x => x.Salon).WithMany()
                .HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => x.SalonId).IsUnique();
        });

        // ── WhatsApp ──────────────────────────────────────────────────────────
        m.Entity<WhatsAppSetting>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ApiToken).HasMaxLength(500);
            e.Property(x => x.PhoneNumberId).HasMaxLength(50);
            e.Property(x => x.FromNumber).HasMaxLength(30);
            e.HasOne(x => x.Salon).WithMany()
                .HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.SalonId).IsUnique();
        });

        m.Entity<WhatsAppLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ToNumber).HasMaxLength(30).IsRequired();
            e.Property(x => x.MessageBody).HasMaxLength(4096).IsRequired();
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("pending");
            e.Property(x => x.ErrorDetail).HasMaxLength(500);
            e.Property(x => x.SentByName).HasMaxLength(200);
            e.HasOne(x => x.Customer).WithMany()
                .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.CreatedAtUtc });
        });

        // ── Survey ────────────────────────────────────────────────────────────
        m.Entity<Survey>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(300).IsRequired();
            e.Property(x => x.Description).HasMaxLength(1000);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("Active");
            e.HasOne(x => x.Salon).WithMany()
                .HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.Status });
        });

        m.Entity<SurveyQuestion>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Text).HasMaxLength(500).IsRequired();
            e.Property(x => x.Type).HasMaxLength(20).IsRequired().HasDefaultValue("rating");
            e.Property(x => x.Options).HasMaxLength(1000);
            e.HasOne(x => x.Survey).WithMany(x => x.Questions)
                .HasForeignKey(x => x.SurveyId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.SurveyId);
        });

        m.Entity<SurveyResponse>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.CustomerName).HasMaxLength(200);
            e.Property(x => x.Email).HasMaxLength(150);
            e.HasOne(x => x.Survey).WithMany(x => x.Responses)
                .HasForeignKey(x => x.SurveyId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Customer).WithMany()
                .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SurveyId);
        });

        m.Entity<SurveyAnswer>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Value).HasMaxLength(2000);
            e.HasOne(x => x.Response).WithMany(x => x.Answers)
                .HasForeignKey(x => x.ResponseId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Question).WithMany(x => x.Answers)
                .HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.ResponseId);
        });

        // ── PlatformAnnouncements ─────────────────────────────────────────────
        m.Entity<PlatformAnnouncement>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(300).IsRequired();
            e.Property(x => x.Type).HasMaxLength(20).IsRequired().HasDefaultValue("info");
            e.HasMany(x => x.Reads).WithOne(x => x.Announcement)
                .HasForeignKey(x => x.AnnouncementId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.IsPublished);
        });

        m.Entity<PlatformAnnouncementRead>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.AnnouncementId, x.SalonId }).IsUnique();
        });

        // ── SupportTickets ────────────────────────────────────────────────────
        m.Entity<SupportTicket>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Subject).HasMaxLength(300).IsRequired();
            e.Property(x => x.SalonName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Status).HasMaxLength(20).IsRequired().HasDefaultValue("Open");
            e.HasMany(x => x.Replies).WithOne(x => x.Ticket)
                .HasForeignKey(x => x.TicketId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => x.Status);
        });

        m.Entity<SupportTicketReply>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.AuthorName).HasMaxLength(200).IsRequired();
            e.HasIndex(x => x.TicketId);
        });

        // ── StockItem ─────────────────────────────────────────────────────────
        m.Entity<StockItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(300).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100);
            e.Property(x => x.Unit).HasMaxLength(50);
            e.Property(x => x.Barcode).HasMaxLength(100);
            e.Property(x => x.Supplier).HasMaxLength(200);
            e.Property(x => x.UnitCost).HasColumnType("numeric(18,2)");
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.Category });
        });

        // ── StockMovement ─────────────────────────────────────────────────────
        m.Entity<StockMovement>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Type).HasMaxLength(20).IsRequired();
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasOne(x => x.StockItem).WithMany(x => x.Movements)
                .HasForeignKey(x => x.StockItemId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany()
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.StockItemId);
        });

        // ── AuditLog ──────────────────────────────────────────────────────────
        m.Entity<AuditLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.EntityType).HasMaxLength(100).IsRequired();
            e.Property(x => x.EntityId).HasMaxLength(100).IsRequired();
            e.Property(x => x.Action).HasMaxLength(50).IsRequired();
            e.Property(x => x.Description).HasMaxLength(1000).IsRequired();
            e.Property(x => x.IpAddress).HasMaxLength(50);
            e.HasOne(x => x.User).WithMany()
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SalonId);
            e.HasIndex(x => new { x.SalonId, x.CreatedAtUtc });
            e.HasIndex(x => new { x.SalonId, x.EntityType });
        });

        // ── CustomerAccount ───────────────────────────────────────────────────
        m.Entity<CustomerAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne(x => x.Customer).WithMany()
                .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.Email, x.SalonId }).IsUnique();
            e.HasIndex(x => x.CustomerId);
        });
    }
}

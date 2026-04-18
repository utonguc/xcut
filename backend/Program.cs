using System.Text;
using XCut.Api.Data;
using XCut.Api.Models;
using XCut.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "XCut.Api", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization", Type = SecuritySchemeType.Http,
        Scheme = "bearer", BearerFormat = "JWT",
        In = ParameterLocation.Header, Description = "Bearer token gir"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddHostedService<ReportEmailWorker>();
builder.Services.AddHostedService<AppointmentReminderWorker>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<IWhatsAppService, WhatsAppService>();
builder.Services.AddScoped<IAuditService, AuditService>();

var jwtKey      = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT key missing.");
var jwtIssuer   = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = jwtIssuer,
            ValidAudience            = jwtAudience,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddCors(options =>
    options.AddPolicy("frontend", policy =>
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin()));

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

var uploadsRoot = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsRoot),
    RequestPath  = "/uploads",
});

app.MapControllers();

// ── DB init + seed ────────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    for (var attempt = 1; attempt <= 10; attempt++)
    {
        try
        {
            var migrationsAssembly = typeof(AppDbContext).Assembly;
            var hasMigrations      = migrationsAssembly.GetTypes()
                .Any(t => typeof(Microsoft.EntityFrameworkCore.Migrations.Migration).IsAssignableFrom(t));

            if (hasMigrations)
            {
                db.Database.Migrate();
            }
            else
            {
                var creator = (RelationalDatabaseCreator)db.GetService<IRelationalDatabaseCreator>();
                db.Database.EnsureCreated();
                if (!creator.HasTables()) creator.CreateTables();
                SchemaUpdater.ApplyMissingTables(db, logger);
            }
            break;
        }
        catch (Exception ex)
        {
            logger.LogWarning("DB not ready (attempt {A}): {Msg}", attempt, ex.Message);
            if (attempt == 10) throw;
            Thread.Sleep(3000);
        }
    }

    try
    {
        // ── Roller ────────────────────────────────────────────────────────────
        var requiredRoles = new[] { "SuperAdmin", "SalonYonetici", "Stilist", "Kasiyer", "Resepsiyon" };
        foreach (var roleName in requiredRoles)
            if (!db.Roles.Any(x => x.Name == roleName))
                db.Roles.Add(new Role { Name = roleName });
        db.SaveChanges();

        // ── Demo salon ────────────────────────────────────────────────────────
        Salon salon;
        if (!db.Salons.Any())
        {
            salon = new Salon
            {
                Name      = "xCut Demo Salon",
                City      = "İstanbul",
                Country   = "Türkiye",
                IsActive  = true,
                Plan      = "pro",
            };
            db.Salons.Add(salon);
            db.SaveChanges();
        }
        else
        {
            salon = db.Salons.First();
        }

        // ── Admin kullanıcı ───────────────────────────────────────────────────
        if (!db.Users.Any())
        {
            var adminRole = db.Roles.First(x => x.Name == "SuperAdmin");
            db.Users.Add(new User
            {
                SalonId      = salon.Id,
                FullName     = "Sistem Yöneticisi",
                UserName     = "admin",
                Email        = "admin@xcut.local",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!*"),
                IsActive     = true,
                RoleId       = adminRole.Id,
            });
        }

        // ── Hizmet kataloğu ───────────────────────────────────────────────────
        if (!db.Services.Any(x => x.SalonId == salon.Id))
        {
            db.Services.AddRange(
                new Service { SalonId = salon.Id, Name = "Saç Kesimi",       Category = "Saç",    DurationMinutes = 30,  Price = 150,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Saç Boyama",       Category = "Saç",    DurationMinutes = 90,  Price = 400,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Röfle",            Category = "Saç",    DurationMinutes = 120, Price = 500,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Fön",              Category = "Saç",    DurationMinutes = 20,  Price = 100,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Sakal Tıraşı",     Category = "Erkek",  DurationMinutes = 20,  Price = 80,   IsActive = true },
                new Service { SalonId = salon.Id, Name = "Erkek Saç Kesimi", Category = "Erkek",  DurationMinutes = 20,  Price = 100,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Manikür",          Category = "Tırnak", DurationMinutes = 45,  Price = 120,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Pedikür",          Category = "Tırnak", DurationMinutes = 60,  Price = 150,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Kalıcı Oje",       Category = "Tırnak", DurationMinutes = 60,  Price = 200,  IsActive = true },
                new Service { SalonId = salon.Id, Name = "Cilt Bakımı",      Category = "Cilt",   DurationMinutes = 60,  Price = 350,  IsActive = true }
            );
        }

        // ── Stilistler ────────────────────────────────────────────────────────
        if (!db.Stylists.Any(x => x.SalonId == salon.Id))
        {
            db.Stylists.AddRange(
                new Stylist { SalonId = salon.Id, FullName = "Ayşe Kaya",   Specialty = "Saç",   IsActive = true, ExperienceYears = 8  },
                new Stylist { SalonId = salon.Id, FullName = "Mehmet Çelik",Specialty = "Erkek", IsActive = true, ExperienceYears = 5  },
                new Stylist { SalonId = salon.Id, FullName = "Zeynep Yıldız",Specialty = "Tırnak",IsActive = true, ExperienceYears = 4 }
            );
        }

        // ── Organizasyon ayarları ─────────────────────────────────────────────
        if (!db.OrganizationSettings.Any(x => x.SalonId == salon.Id))
        {
            db.OrganizationSettings.Add(new OrganizationSetting
            {
                SalonId          = salon.Id,
                CompanyName      = "xCut Demo Salon",
                ApplicationTitle = "xCut",
                PrimaryColor     = "#7c3aed",
            });
        }

        // ── Modül lisansları ──────────────────────────────────────────────────
        if (!db.ModuleLicenses.Any(x => x.SalonId == salon.Id))
        {
            var allModules = new[]
            {
                "crm","appointments","stylists","services","reports",
                "finance","inventory","assets","tasks",
                "notifications","surveys","whatsapp","website"
            };
            foreach (var code in allModules)
                db.ModuleLicenses.Add(new ModuleLicense { SalonId = salon.Id, ModuleCode = code, IsActive = true });
        }

        db.SaveChanges();
    }
    catch (Exception ex)
    {
        var log2 = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        log2.LogError(ex, "Seed data hatası. Uygulama devam ediyor.");
    }
}

app.Run();

public class UtcDateTimeConverter : System.Text.Json.Serialization.JsonConverter<DateTime>
{
    public override DateTime Read(ref System.Text.Json.Utf8JsonReader reader,
        Type typeToConvert, System.Text.Json.JsonSerializerOptions options)
        => DateTime.SpecifyKind(reader.GetDateTime(), DateTimeKind.Utc);

    public override void Write(System.Text.Json.Utf8JsonWriter writer,
        DateTime value, System.Text.Json.JsonSerializerOptions options)
        => writer.WriteStringValue(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}

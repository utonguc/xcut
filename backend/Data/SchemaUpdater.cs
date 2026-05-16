using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Data;

/// <summary>
/// Runs after EnsureCreated to add any tables that were added to the model
/// after the initial database creation. This prevents having to wipe the
/// database (and losing data) every time a new entity is introduced.
///
/// Add a new "-- TABLE: TableName" block here whenever a new entity is added to AppDbContext.
/// </summary>
public static class SchemaUpdater
{
    public static void ApplyMissingTables(AppDbContext db, ILogger logger)
    {
        try
        {
            db.Database.ExecuteSqlRaw(Sql);
            logger.LogInformation("SchemaUpdater: missing tables check completed.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SchemaUpdater failed.");
        }
    }

    // Language: PostgreSQL
    // Each block is idempotent (CREATE TABLE IF NOT EXISTS).
    // Only add tables here that were added AFTER the initial EnsureCreated run.
    private const string Sql = """

        -- TABLE: StylistSchedules
        CREATE TABLE IF NOT EXISTS "StylistSchedules" (
            "Id"          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "StylistId"   uuid        NOT NULL,
            "SalonId"     uuid        NOT NULL,
            "DayOfWeek"   integer     NOT NULL,
            "StartTime"   interval    NOT NULL,
            "EndTime"     interval    NOT NULL,
            "SlotMinutes" integer     NOT NULL DEFAULT 30,
            "IsActive"    boolean     NOT NULL DEFAULT true,
            CONSTRAINT fk_stylistschedules_stylist
                FOREIGN KEY ("StylistId") REFERENCES "Stylists"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_stylistschedules_stylist ON "StylistSchedules"("StylistId");

        -- TABLE: StylistLeaves
        CREATE TABLE IF NOT EXISTS "StylistLeaves" (
            "Id"          uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "StylistId"   uuid         NOT NULL,
            "SalonId"     uuid         NOT NULL,
            "StartAtUtc"  timestamptz  NOT NULL,
            "EndAtUtc"    timestamptz  NOT NULL,
            "Reason"      text,
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_stylistleaves_stylist
                FOREIGN KEY ("StylistId") REFERENCES "Stylists"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_stylistleaves_stylist ON "StylistLeaves"("StylistId");

        -- TABLE: AppointmentRequests
        CREATE TABLE IF NOT EXISTS "AppointmentRequests" (
            "Id"                    uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"               uuid         NOT NULL,
            "StylistId"             uuid         NOT NULL,
            "RequestedStartUtc"     timestamptz  NOT NULL,
            "RequestedEndUtc"       timestamptz  NOT NULL,
            "ServiceName"           text         NOT NULL,
            "CustomerFirstName"     text         NOT NULL,
            "CustomerLastName"      text         NOT NULL,
            "CustomerPhone"         text,
            "CustomerEmail"         text,
            "CustomerNotes"         text,
            "Status"                text         NOT NULL DEFAULT 'Pending',
            "RejectionReason"       text,
            "ReviewedByUserId"      uuid,
            "ReviewedAtUtc"         timestamptz,
            "CreatedAppointmentId"  uuid,
            "CreatedAtUtc"          timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT fk_apptreq_stylist
                FOREIGN KEY ("StylistId") REFERENCES "Stylists"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_apptreq_salon   ON "AppointmentRequests"("SalonId");
        CREATE INDEX IF NOT EXISTS ix_apptreq_status  ON "AppointmentRequests"("Status");

        -- TABLE: SalonWebsites
        CREATE TABLE IF NOT EXISTS "SalonWebsites" (
            "Id"              uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"         uuid         NOT NULL UNIQUE,
            "Slug"            text         NOT NULL UNIQUE,
            "CustomDomain"    text,
            "IsPublished"     boolean      NOT NULL DEFAULT false,
            "HeroTitle"       text,
            "HeroSubtitle"    text,
            "HeroImageUrl"    text,
            "AboutText"       text,
            "Address"         text,
            "Phone"           text,
            "Email"           text,
            "GoogleMapsUrl"   text,
            "InstagramUrl"    text,
            "FacebookUrl"     text,
            "WhatsAppNumber"  text,
            "PrimaryColor"    text         NOT NULL DEFAULT '#1d4ed8',
            "Theme"           text         NOT NULL DEFAULT 'modern',
            "MetaTitle"       text,
            "MetaDescription" text,
            "MetaKeywords"    text,
            "ShowPrices"      boolean      NOT NULL DEFAULT true,
            "ShowReviews"     boolean      NOT NULL DEFAULT true,
            "BookingEnabled"  boolean      NOT NULL DEFAULT true,
            "ListedInDirectory" boolean    NOT NULL DEFAULT false,
            "UpdatedAtUtc"    timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT fk_salonwebsite_salon
                FOREIGN KEY ("SalonId") REFERENCES "Salons"("Id") ON DELETE CASCADE
        );

        -- TABLE: AuditLogs
        CREATE TABLE IF NOT EXISTS "AuditLogs" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "UserId"       uuid,
            "EntityType"   varchar(100) NOT NULL,
            "EntityId"     varchar(100) NOT NULL,
            "Action"       varchar(50)  NOT NULL,
            "Description"  varchar(1000) NOT NULL,
            "ChangesJson"  text,
            "IpAddress"    varchar(50),
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT fk_auditlog_user
                FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_auditlogs_salon      ON "AuditLogs"("SalonId");
        CREATE INDEX IF NOT EXISTS ix_auditlogs_salon_time ON "AuditLogs"("SalonId", "CreatedAtUtc" DESC);
        CREATE INDEX IF NOT EXISTS ix_auditlogs_entity     ON "AuditLogs"("SalonId", "EntityType");

        -- TABLE: CustomerAccounts (müşteri portal girişi)
        CREATE TABLE IF NOT EXISTS "CustomerAccounts" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "CustomerId"   uuid         NOT NULL,
            "SalonId"      uuid         NOT NULL,
            "Email"        varchar(200) NOT NULL,
            "PasswordHash" varchar(200) NOT NULL,
            "IsActive"     boolean      NOT NULL DEFAULT true,
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now(),
            "LastLoginUtc" timestamptz,
            CONSTRAINT fk_customeraccount_customer
                FOREIGN KEY ("CustomerId") REFERENCES "Customers"("Id") ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_customeraccounts_email_salon ON "CustomerAccounts"("Email", "SalonId");
        CREATE INDEX IF NOT EXISTS ix_customeraccounts_customer ON "CustomerAccounts"("CustomerId");

        -- Add missing columns to existing tables (idempotent via DO block)
        DO $$
        BEGIN
            -- DedupeKey on Notifications
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'Notifications' AND column_name = 'DedupeKey'
            ) THEN
                ALTER TABLE "Notifications" ADD COLUMN "DedupeKey" varchar(200);
            END IF;

            -- AppointmentId + MessageType on WhatsAppLogs
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'WhatsAppLogs' AND column_name = 'AppointmentId'
            ) THEN
                ALTER TABLE "WhatsAppLogs" ADD COLUMN "AppointmentId" uuid;
                ALTER TABLE "WhatsAppLogs" ADD COLUMN "MessageType" varchar(50);
            END IF;

            -- ProfilePhotoUrl on Users
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'Users' AND column_name = 'ProfilePhotoUrl'
            ) THEN
                ALTER TABLE "Users" ADD COLUMN "ProfilePhotoUrl" text;
            END IF;

            -- TrialEndsAtUtc + Plan on Salons
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'Salons' AND column_name = 'TrialEndsAtUtc'
            ) THEN
                ALTER TABLE "Salons" ADD COLUMN "TrialEndsAtUtc" timestamptz;
                ALTER TABLE "Salons" ADD COLUMN "Plan" varchar(50);
            END IF;

            -- EmailDomain on Salons
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'Salons' AND column_name = 'EmailDomain'
            ) THEN
                ALTER TABLE "Salons" ADD COLUMN "EmailDomain" varchar(200);
                CREATE UNIQUE INDEX IF NOT EXISTS ix_salons_emaildomain
                    ON "Salons"("EmailDomain") WHERE "EmailDomain" IS NOT NULL;
            END IF;

            -- ServiceId on Appointments (nullable FK to Services)
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'Appointments' AND column_name = 'ServiceId'
            ) THEN
                ALTER TABLE "Appointments" ADD COLUMN "ServiceId" uuid;
            END IF;

        END $$;

        CREATE INDEX IF NOT EXISTS ix_wa_logs_appointment ON "WhatsAppLogs"("AppointmentId", "MessageType")
            WHERE "AppointmentId" IS NOT NULL;

        CREATE INDEX IF NOT EXISTS ix_notifications_dedupe ON "Notifications"("SalonId", "DedupeKey", "CreatedAtUtc" DESC)
            WHERE "DedupeKey" IS NOT NULL;

        -- TABLE: Surveys
        CREATE TABLE IF NOT EXISTS "Surveys" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "Title"        text         NOT NULL,
            "Description"  text,
            "Status"       varchar(20)  NOT NULL DEFAULT 'Active',
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now(),
            "UpdatedAtUtc" timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT fk_surveys_salon
                FOREIGN KEY ("SalonId") REFERENCES "Salons"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_surveys_salon ON "Surveys"("SalonId");

        -- TABLE: SurveyQuestions
        CREATE TABLE IF NOT EXISTS "SurveyQuestions" (
            "Id"         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SurveyId"   uuid        NOT NULL,
            "SortOrder"  integer     NOT NULL DEFAULT 1,
            "Text"       text        NOT NULL,
            "Type"       varchar(20) NOT NULL DEFAULT 'rating',
            "Options"    text,
            "IsRequired" boolean     NOT NULL DEFAULT true,
            CONSTRAINT fk_surveyquestions_survey
                FOREIGN KEY ("SurveyId") REFERENCES "Surveys"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_surveyquestions_survey ON "SurveyQuestions"("SurveyId");

        -- TABLE: SurveyResponses
        CREATE TABLE IF NOT EXISTS "SurveyResponses" (
            "Id"             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SurveyId"       uuid        NOT NULL,
            "CustomerId"     uuid,
            "CustomerName"   text,
            "Email"          text,
            "SubmittedAtUtc" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_surveyresponses_survey
                FOREIGN KEY ("SurveyId") REFERENCES "Surveys"("Id") ON DELETE CASCADE,
            CONSTRAINT fk_surveyresponses_customer
                FOREIGN KEY ("CustomerId") REFERENCES "Customers"("Id") ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_surveyresponses_survey ON "SurveyResponses"("SurveyId");

        -- TABLE: SurveyAnswers
        CREATE TABLE IF NOT EXISTS "SurveyAnswers" (
            "Id"         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "ResponseId" uuid NOT NULL,
            "QuestionId" uuid NOT NULL,
            "Value"      text,
            CONSTRAINT fk_surveyanswers_response
                FOREIGN KEY ("ResponseId") REFERENCES "SurveyResponses"("Id") ON DELETE CASCADE,
            CONSTRAINT fk_surveyanswers_question
                FOREIGN KEY ("QuestionId") REFERENCES "SurveyQuestions"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_surveyanswers_response ON "SurveyAnswers"("ResponseId");

        -- TABLE: PlatformAnnouncements
        CREATE TABLE IF NOT EXISTS "PlatformAnnouncements" (
            "Id"           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "Title"        text        NOT NULL,
            "Body"         text        NOT NULL,
            "Type"         varchar(20) NOT NULL DEFAULT 'info',
            "IsPublished"  boolean     NOT NULL DEFAULT true,
            "ExpiresAtUtc" timestamptz,
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_platformann_published ON "PlatformAnnouncements"("IsPublished");

        -- TABLE: PlatformAnnouncementReads
        CREATE TABLE IF NOT EXISTS "PlatformAnnouncementReads" (
            "Id"             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "AnnouncementId" uuid        NOT NULL,
            "SalonId"        uuid        NOT NULL,
            "ReadAtUtc"      timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_annread_announcement
                FOREIGN KEY ("AnnouncementId") REFERENCES "PlatformAnnouncements"("Id") ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_annread_unique ON "PlatformAnnouncementReads"("AnnouncementId", "SalonId");

        -- TABLE: SupportTickets
        CREATE TABLE IF NOT EXISTS "SupportTickets" (
            "Id"           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid        NOT NULL,
            "SalonName"    text        NOT NULL,
            "Subject"      text        NOT NULL,
            "Body"         text        NOT NULL,
            "PageUrl"      text,
            "Status"       varchar(20) NOT NULL DEFAULT 'Open',
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now(),
            "UpdatedAtUtc" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_supporttickets_salon  ON "SupportTickets"("SalonId");
        CREATE INDEX IF NOT EXISTS ix_supporttickets_status ON "SupportTickets"("Status");

        -- TABLE: SupportTicketReplies
        CREATE TABLE IF NOT EXISTS "SupportTicketReplies" (
            "Id"           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "TicketId"     uuid        NOT NULL,
            "Body"         text        NOT NULL,
            "IsFromAdmin"  boolean     NOT NULL DEFAULT false,
            "AuthorName"   text        NOT NULL,
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_ticketreply_ticket
                FOREIGN KEY ("TicketId") REFERENCES "SupportTickets"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_ticketreplies_ticket ON "SupportTicketReplies"("TicketId");

        -- TABLE: PosTransactions
        CREATE TABLE IF NOT EXISTS "PosTransactions" (
            "Id"             uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"        uuid         NOT NULL,
            "StylistId"      uuid,
            "CustomerName"   text,
            "Subtotal"       numeric(18,2) NOT NULL DEFAULT 0,
            "DiscountType"   varchar(20)  NOT NULL DEFAULT 'none',
            "DiscountValue"  numeric(18,2) NOT NULL DEFAULT 0,
            "DiscountAmount" numeric(18,2) NOT NULL DEFAULT 0,
            "Total"          numeric(18,2) NOT NULL DEFAULT 0,
            "PaymentMethod"  varchar(20)  NOT NULL DEFAULT 'cash',
            "CashAmount"     numeric(18,2) NOT NULL DEFAULT 0,
            "CardAmount"     numeric(18,2) NOT NULL DEFAULT 0,
            "Notes"          text,
            "Status"         varchar(20)  NOT NULL DEFAULT 'completed',
            "CreatedAtUtc"   timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT fk_postx_stylist
                FOREIGN KEY ("StylistId") REFERENCES "Stylists"("Id") ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_postx_salon      ON "PosTransactions"("SalonId");
        CREATE INDEX IF NOT EXISTS ix_postx_stylist    ON "PosTransactions"("StylistId");
        CREATE INDEX IF NOT EXISTS ix_postx_salon_date ON "PosTransactions"("SalonId", "CreatedAtUtc" DESC);

        -- TABLE: PosTransactionItems
        CREATE TABLE IF NOT EXISTS "PosTransactionItems" (
            "Id"            uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "TransactionId" uuid         NOT NULL,
            "ServiceId"     uuid,
            "Name"          text         NOT NULL,
            "UnitPrice"     numeric(18,2) NOT NULL DEFAULT 0,
            "Quantity"      integer      NOT NULL DEFAULT 1,
            "LineTotal"     numeric(18,2) NOT NULL DEFAULT 0,
            CONSTRAINT fk_postxitem_tx
                FOREIGN KEY ("TransactionId") REFERENCES "PosTransactions"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_postxitem_tx ON "PosTransactionItems"("TransactionId");

        -- CommissionRate on Stylists
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'Stylists' AND column_name = 'CommissionRate'
            ) THEN
                ALTER TABLE "Stylists" ADD COLUMN "CommissionRate" numeric(5,2) NOT NULL DEFAULT 0;
            END IF;
        END $$;

        -- TABLE: BankAccounts
        CREATE TABLE IF NOT EXISTS "BankAccounts" (
            "Id"           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid        NOT NULL,
            "BankName"     text        NOT NULL,
            "AccountName"  text        NOT NULL,
            "IBAN"         text,
            "IsActive"     boolean     NOT NULL DEFAULT true,
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_bankaccounts_salon ON "BankAccounts"("SalonId");

        -- TABLE: CashSessions
        CREATE TABLE IF NOT EXISTS "CashSessions" (
            "Id"               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"          uuid          NOT NULL,
            "OpenedByUserId"   uuid          NOT NULL,
            "ClosedByUserId"   uuid,
            "OpeningBalance"   numeric(18,2) NOT NULL DEFAULT 0,
            "ClosingBalance"   numeric(18,2),
            "Status"           text          NOT NULL DEFAULT 'Open',
            "Notes"            text,
            "OpenedAtUtc"      timestamptz   NOT NULL DEFAULT now(),
            "ClosedAtUtc"      timestamptz
        );
        CREATE INDEX IF NOT EXISTS ix_cashsessions_salon_status ON "CashSessions"("SalonId", "Status");

        -- TABLE: CashExpenses
        CREATE TABLE IF NOT EXISTS "CashExpenses" (
            "Id"               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"          uuid          NOT NULL,
            "CashSessionId"    uuid,
            "Description"      text          NOT NULL,
            "Category"         text          NOT NULL DEFAULT 'Genel',
            "Amount"           numeric(18,2) NOT NULL DEFAULT 0,
            "PaymentMethod"    text          NOT NULL DEFAULT 'cash',
            "BankAccountId"    uuid,
            "CreatedByUserId"  uuid,
            "Notes"            text,
            "CreatedAtUtc"     timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT fk_cashexpense_session
                FOREIGN KEY ("CashSessionId") REFERENCES "CashSessions"("Id") ON DELETE SET NULL,
            CONSTRAINT fk_cashexpense_bank
                FOREIGN KEY ("BankAccountId") REFERENCES "BankAccounts"("Id") ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_cashexpenses_salon    ON "CashExpenses"("SalonId");
        CREATE INDEX IF NOT EXISTS ix_cashexpenses_session  ON "CashExpenses"("CashSessionId");

        -- TABLE: ColorFormulas
        CREATE TABLE IF NOT EXISTS "ColorFormulas" (
            "Id"               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"          uuid        NOT NULL,
            "CustomerId"       uuid        NOT NULL,
            "StylistId"        uuid,
            "FormulaName"      text        NOT NULL,
            "Brand"            text,
            "ColorsJson"       text,
            "Developer"        text,
            "DeveloperVolume"  text,
            "ProcessMinutes"   integer,
            "Notes"            text,
            "CreatedAtUtc"     timestamptz NOT NULL DEFAULT now(),
            "UpdatedAtUtc"     timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_colorformula_customer
                FOREIGN KEY ("CustomerId") REFERENCES "Customers"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_colorformulas_customer ON "ColorFormulas"("CustomerId");
        CREATE INDEX IF NOT EXISTS ix_colorformulas_salon    ON "ColorFormulas"("SalonId");

        -- ALTER: PosTransactions — yeni kolonlar
        ALTER TABLE "PosTransactions"
            ADD COLUMN IF NOT EXISTS "AppointmentId" uuid,
            ADD COLUMN IF NOT EXISTS "CashSessionId" uuid,
            ADD COLUMN IF NOT EXISTS "BankAccountId" uuid,
            ADD COLUMN IF NOT EXISTS "BankAmount"    numeric(18,2) NOT NULL DEFAULT 0;

        -- ALTER: Appointments — kasa bağlantısı
        ALTER TABLE "Appointments"
            ADD COLUMN IF NOT EXISTS "PosTransactionId" uuid;

        -- TABLE: PermissionGroups
        CREATE TABLE IF NOT EXISTS "PermissionGroups" (
            "Id"             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"        uuid        NOT NULL,
            "Name"           text        NOT NULL,
            "Description"    text,
            "AllowedModules" text        NOT NULL DEFAULT '[]',
            "IsSelfOnly"     boolean     NOT NULL DEFAULT false,
            "IsBuiltIn"      boolean     NOT NULL DEFAULT false,
            "CreatedAtUtc"   timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_permgroups_salon ON "PermissionGroups"("SalonId");

        -- TABLE: UserPermissionGroups
        CREATE TABLE IF NOT EXISTS "UserPermissionGroups" (
            "UserId"            uuid NOT NULL,
            "PermissionGroupId" uuid NOT NULL,
            PRIMARY KEY ("UserId", "PermissionGroupId"),
            CONSTRAINT fk_upg_user  FOREIGN KEY ("UserId")  REFERENCES "Users"("Id") ON DELETE CASCADE,
            CONSTRAINT fk_upg_group FOREIGN KEY ("PermissionGroupId") REFERENCES "PermissionGroups"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_userpermgroups_group ON "UserPermissionGroups"("PermissionGroupId");

        -- ALTER: StockItems — alış/satış fiyatları + prim
        ALTER TABLE "StockItems"
            ADD COLUMN IF NOT EXISTS "SalePrice"       numeric(18,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "StaffBonusPct"   numeric(5,2)  NOT NULL DEFAULT 0;

        -- ALTER: Stylists — ücret tipi ve sabit ücret
        ALTER TABLE "Stylists"
            ADD COLUMN IF NOT EXISTS "PayType"         varchar(20)   NOT NULL DEFAULT 'commission',
            ADD COLUMN IF NOT EXISTS "FixedSalary"     numeric(18,2) NOT NULL DEFAULT 0;

        -- PosTransactions: CustomerId link
        ALTER TABLE "PosTransactions"
            ADD COLUMN IF NOT EXISTS "CustomerId" uuid REFERENCES "Customers"("Id") ON DELETE SET NULL;

        -- PosTransactionItems: stock item link + staff bonus
        ALTER TABLE "PosTransactionItems"
            ADD COLUMN IF NOT EXISTS "StockItemId"   uuid REFERENCES "StockItems"("Id") ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS "StaffBonusPct" numeric(5,2) NOT NULL DEFAULT 0;

        -- Puantaj / Devam tablosu
        CREATE TABLE IF NOT EXISTS "StylistAttendances" (
            "Id"           uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid          NOT NULL,
            "StylistId"    uuid          NOT NULL REFERENCES "Stylists"("Id") ON DELETE CASCADE,
            "Status"       varchar(20)   NOT NULL DEFAULT 'present',
            "Date"         date          NOT NULL,
            "CheckIn"      varchar(8),
            "CheckOut"     varchar(8),
            "Note"         text,
            "CreatedAtUtc" timestamptz   NOT NULL DEFAULT now(),
            UNIQUE ("StylistId", "Date")
        );

        -- LeaveType on StylistLeaves
        ALTER TABLE "StylistLeaves"
            ADD COLUMN IF NOT EXISTS "LeaveType" text NOT NULL DEFAULT 'Mazeret';

        -- IsHalfDay on StylistAttendances + WeeklyOffDays on Salons
        ALTER TABLE "StylistAttendances"
            ADD COLUMN IF NOT EXISTS "IsHalfDay" boolean NOT NULL DEFAULT false;

        ALTER TABLE "Salons"
            ADD COLUMN IF NOT EXISTS "WeeklyOffDays" text NOT NULL DEFAULT '0';

        -- PersonelLeaveRequests table
        CREATE TABLE IF NOT EXISTS "PersonelLeaveRequests" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "StylistId"    uuid         NOT NULL REFERENCES "Stylists"("Id") ON DELETE CASCADE,
            "LeaveType"    text         NOT NULL DEFAULT 'Mazeret',
            "StartDate"    date         NOT NULL,
            "EndDate"      date         NOT NULL,
            "IsHalfDay"    boolean      NOT NULL DEFAULT false,
            "Note"         text,
            "Status"       varchar(20)  NOT NULL DEFAULT 'Pending',
            "RequestedAt"  timestamptz  NOT NULL DEFAULT now(),
            "ProcessedAt"  timestamptz,
            "ProcessedBy"  uuid,
            "RejectReason" text
        );
        CREATE INDEX IF NOT EXISTS ix_plr_salon_status ON "PersonelLeaveRequests"("SalonId", "Status");

        -- ApproverId on Stylists
        ALTER TABLE "Stylists"
            ADD COLUMN IF NOT EXISTS "ApproverId" uuid;

        -- New built-in roles
        INSERT INTO "Roles" ("Id", "Name") SELECT gen_random_uuid(), 'Calfa'    WHERE NOT EXISTS (SELECT 1 FROM "Roles" WHERE "Name"='Calfa');
        INSERT INTO "Roles" ("Id", "Name") SELECT gen_random_uuid(), 'Kiosk'    WHERE NOT EXISTS (SELECT 1 FROM "Roles" WHERE "Name"='Kiosk');
        INSERT INTO "Roles" ("Id", "Name") SELECT gen_random_uuid(), 'Muhasebe' WHERE NOT EXISTS (SELECT 1 FROM "Roles" WHERE "Name"='Muhasebe');
        INSERT INTO "Roles" ("Id", "Name") SELECT gen_random_uuid(), 'CRM'      WHERE NOT EXISTS (SELECT 1 FROM "Roles" WHERE "Name"='CRM');

        -- Notifications table
        CREATE TABLE IF NOT EXISTS "Notifications" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "UserId"       uuid         NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
            "Title"        text         NOT NULL DEFAULT '',
            "Message"      text         NOT NULL DEFAULT '',
            "Type"         varchar(20)  NOT NULL DEFAULT 'info',
            "Link"         text,
            "IsRead"       boolean      NOT NULL DEFAULT false,
            "DedupeKey"    varchar(200),
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_notif_user_unread ON "Notifications"("UserId", "IsRead");

        -- ServiceCategories table
        CREATE TABLE IF NOT EXISTS "ServiceCategories" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "Name"         text         NOT NULL DEFAULT '',
            "Description"  text,
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now()
        );
        ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "CategoryId"   uuid REFERENCES "ServiceCategories"("Id") ON DELETE SET NULL;
        ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "Description"  text;

        -- TABLE: LeaveBalances
        CREATE TABLE IF NOT EXISTS "LeaveBalances" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "StylistId"    uuid         NOT NULL REFERENCES "Stylists"("Id") ON DELETE CASCADE,
            "Year"         integer      NOT NULL,
            "EntitledDays" integer      NOT NULL DEFAULT 14,
            "UpdatedAtUtc" timestamptz  NOT NULL DEFAULT now(),
            UNIQUE ("StylistId", "Year")
        );
        CREATE INDEX IF NOT EXISTS ix_leavebalances_salon ON "LeaveBalances"("SalonId");

        -- IsDemo flag for Services (demo seed/cleanup support)
        ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "IsDemo" boolean NOT NULL DEFAULT false;

        -- TABLE: GoogleCalendarTokens
        CREATE TABLE IF NOT EXISTS "GoogleCalendarTokens" (
            "Id"              uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"         uuid         NOT NULL UNIQUE,
            "AccessToken"     text         NOT NULL,
            "RefreshToken"    text,
            "ExpiresAtUtc"    timestamptz  NOT NULL,
            "CalendarId"      varchar(200) NOT NULL DEFAULT 'primary',
            "CalendarName"    varchar(200),
            "ConnectedAtUtc"  timestamptz  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_gcaltokens_salon ON "GoogleCalendarTokens"("SalonId");

        -- GcalEventId on Appointments
        ALTER TABLE "Appointments"
            ADD COLUMN IF NOT EXISTS "GcalEventId" text;

        -- Per-user Google Calendar: UserId + ConnectedEmail on tokens
        ALTER TABLE "GoogleCalendarTokens"
            ADD COLUMN IF NOT EXISTS "UserId"         uuid,
            ADD COLUMN IF NOT EXISTS "ConnectedEmail" varchar(200);

        -- Drop old UNIQUE constraint on SalonId (replaced by partial indexes)
        DO $$
        DECLARE v_con text;
        BEGIN
            SELECT constraint_name INTO v_con
            FROM information_schema.table_constraints
            WHERE table_name = 'GoogleCalendarTokens'
              AND constraint_type = 'UNIQUE'
              AND constraint_name LIKE '%SalonId%'
            LIMIT 1;
            IF v_con IS NOT NULL THEN
                EXECUTE 'ALTER TABLE "GoogleCalendarTokens" DROP CONSTRAINT "' || v_con || '"';
            END IF;
        END $$;

        -- One salon-level token per salon (UserId IS NULL)
        CREATE UNIQUE INDEX IF NOT EXISTS ix_gcaltokens_salon_null
            ON "GoogleCalendarTokens"("SalonId") WHERE "UserId" IS NULL;

        -- One per-user token per (salon, user)
        CREATE UNIQUE INDEX IF NOT EXISTS ix_gcaltokens_salon_user
            ON "GoogleCalendarTokens"("SalonId", "UserId") WHERE "UserId" IS NOT NULL;

        -- Stylist's personal calendar event ID on Appointments
        ALTER TABLE "Appointments"
            ADD COLUMN IF NOT EXISTS "GcalStylistEventId" text;

        -- ShowOnWebsite on Stylists (web sitesinde göster / gizle)
        ALTER TABLE "Stylists"
            ADD COLUMN IF NOT EXISTS "ShowOnWebsite" boolean NOT NULL DEFAULT true;

        -- TABLE: SupportMessages (new message-based support system)
        CREATE TABLE IF NOT EXISTS "SupportMessages" (
            "Id"           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "TicketId"     uuid        NOT NULL REFERENCES "SupportTickets"("Id") ON DELETE CASCADE,
            "Body"         text        NOT NULL DEFAULT '',
            "IsFromAdmin"  boolean     NOT NULL DEFAULT false,
            "AuthorName"   varchar(200) NOT NULL DEFAULT '',
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_supportmessages_ticket ON "SupportMessages"("TicketId");

        -- ALTER: SupportTickets — add new columns for richer support system
        ALTER TABLE "SupportTickets"
            ADD COLUMN IF NOT EXISTS "UserId"      uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            ADD COLUMN IF NOT EXISTS "UserName"    varchar(200) NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS "PageContext" text;

        -- TABLE: Announcements (advanced, with recurrence & targeting)
        CREATE TABLE IF NOT EXISTS "Announcements" (
            "Id"                  uuid         PRIMARY KEY,
            "Title"               varchar(500) NOT NULL DEFAULT '',
            "Body"                text,
            "Type"                varchar(50)  NOT NULL DEFAULT 'info',
            "Priority"            int          NOT NULL DEFAULT 0,
            "IsPublished"         boolean      NOT NULL DEFAULT false,
            "StartsAtUtc"         timestamptz,
            "ExpiresAtUtc"        timestamptz,
            "ExcludedSalonIds"    text         NOT NULL DEFAULT '[]',
            "IsRecurring"         boolean      NOT NULL DEFAULT false,
            "RecurrenceType"      varchar(50),
            "RecurrenceDays"      varchar(100),
            "RecurrenceStartTime" varchar(10),
            "RecurrenceEndTime"   varchar(10),
            "ReadCount"           int          NOT NULL DEFAULT 0,
            "CreatedAtUtc"        timestamptz  NOT NULL DEFAULT now(),
            "UpdatedAtUtc"        timestamptz  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_announcements_published ON "Announcements"("IsPublished");
        CREATE INDEX IF NOT EXISTS ix_announcements_priority  ON "Announcements"("Priority" DESC);

        -- MfaEnabled on OrganizationSettings
        ALTER TABLE "OrganizationSettings"
            ADD COLUMN IF NOT EXISTS "MfaEnabled" boolean NOT NULL DEFAULT false;

        -- Reminder tracking on Appointments
        ALTER TABLE "Appointments"
            ADD COLUMN IF NOT EXISTS "Reminder24hSentAt" timestamptz,
            ADD COLUMN IF NOT EXISTS "Reminder1hSentAt"  timestamptz;

        -- NotificationConfig on OrganizationSettings (JSON blob for notification preferences)
        ALTER TABLE "OrganizationSettings"
            ADD COLUMN IF NOT EXISTS "NotificationConfig" text;

        -- TABLE: StylistServices (stilist-hizmet ilişkisi)
        CREATE TABLE IF NOT EXISTS "StylistServices" (
            "StylistId" uuid NOT NULL,
            "ServiceId" uuid NOT NULL,
            CONSTRAINT "PK_StylistServices" PRIMARY KEY ("StylistId", "ServiceId"),
            CONSTRAINT fk_stylistservices_stylist
                FOREIGN KEY ("StylistId") REFERENCES "Stylists"("Id") ON DELETE CASCADE,
            CONSTRAINT fk_stylistservices_service
                FOREIGN KEY ("ServiceId") REFERENCES "Services"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_stylistservices_stylist ON "StylistServices"("StylistId");

        -- TABLE: PasswordResetTokens
        CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "UserId"       uuid         NOT NULL,
            "Token"        text         NOT NULL,
            "ExpiresAtUtc" timestamptz  NOT NULL,
            "UsedAtUtc"    timestamptz,
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT fk_pwdreset_user FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_pwdreset_token ON "PasswordResetTokens"("Token");
        CREATE INDEX IF NOT EXISTS ix_pwdreset_user ON "PasswordResetTokens"("UserId");

        -- TABLE: KioskPlaylists
        CREATE TABLE IF NOT EXISTS "KioskPlaylists" (
            "Id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"      uuid         NOT NULL,
            "Name"         text         NOT NULL DEFAULT '',
            "CreatedAtUtc" timestamptz  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_kioskplaylists_salon ON "KioskPlaylists"("SalonId");

        -- TABLE: KioskSlides
        CREATE TABLE IF NOT EXISTS "KioskSlides" (
            "Id"              uuid  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "PlaylistId"      uuid  NOT NULL,
            "SortOrder"       int   NOT NULL DEFAULT 0,
            "Type"            text  NOT NULL DEFAULT 'html',
            "Content"         text  NOT NULL DEFAULT '',
            "DurationSeconds" int   NOT NULL DEFAULT 10,
            "Title"           text,
            CONSTRAINT fk_kioskslides_playlist FOREIGN KEY ("PlaylistId") REFERENCES "KioskPlaylists"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_kioskslides_playlist ON "KioskSlides"("PlaylistId");

        -- TABLE: KioskMediaItems
        CREATE TABLE IF NOT EXISTS "KioskMediaItems" (
            "Id"            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "SalonId"       uuid        NOT NULL,
            "FileName"      text        NOT NULL DEFAULT '',
            "OriginalName"  text        NOT NULL DEFAULT '',
            "FileUrl"       text        NOT NULL DEFAULT '',
            "MimeType"      text        NOT NULL DEFAULT '',
            "FileSizeBytes" bigint      NOT NULL DEFAULT 0,
            "UploadedAtUtc" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_kioskmediaitems_salon ON "KioskMediaItems"("SalonId");

        -- KioskCodes: new columns for playlist + layout
        ALTER TABLE "KioskCodes" ADD COLUMN IF NOT EXISTS "DisplayLayout" text NOT NULL DEFAULT 'sidebar';
        ALTER TABLE "KioskCodes" ADD COLUMN IF NOT EXISTS "PlaylistId"    uuid REFERENCES "KioskPlaylists"("Id") ON DELETE SET NULL;

        -- TABLE: KioskPairingRequests
        CREATE TABLE IF NOT EXISTS "KioskPairingRequests" (
            "Id"            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "PairingCode"   text        NOT NULL DEFAULT '',
            "CreatedAtUtc"  timestamptz NOT NULL DEFAULT now(),
            "ExpiresAtUtc"  timestamptz NOT NULL DEFAULT now(),
            "IsAccepted"    boolean     NOT NULL DEFAULT false,
            "KioskToken"    text,
            "SalonId"       uuid,
            "SalonName"     text,
            "DisplayLayout" text        NOT NULL DEFAULT 'sidebar',
            "PlaylistId"    uuid,
            "Label"         text
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_kioskpairingrequests_code ON "KioskPairingRequests"("PairingCode");

        -- TABLE: UserSalonAccesses (multi-location salon navigation)
        CREATE TABLE IF NOT EXISTS "UserSalonAccesses" (
            "Id"           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            "UserId"       uuid        NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
            "SalonId"      uuid        NOT NULL REFERENCES "Salons"("Id") ON DELETE CASCADE,
            "GrantedAtUtc" timestamptz NOT NULL DEFAULT now(),
            UNIQUE ("UserId", "SalonId")
        );
        CREATE INDEX IF NOT EXISTS ix_usersalonaccesses_user  ON "UserSalonAccesses"("UserId");
        CREATE INDEX IF NOT EXISTS ix_usersalonaccesses_salon ON "UserSalonAccesses"("SalonId");

        -- Invoices.CustomerId → nullable (POS-linked invoices may not have a customer)
        ALTER TABLE "Invoices" ALTER COLUMN "CustomerId" DROP NOT NULL;

        -- Invoices: link to POS transaction
        ALTER TABLE "Invoices" ADD COLUMN IF NOT EXISTS "PosTransactionId" uuid REFERENCES "PosTransactions"("Id") ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS ix_invoices_postransaction ON "Invoices"("PosTransactionId");

        -- ScheduledReports: wizard filters + send hour
        ALTER TABLE "ScheduledReports" ADD COLUMN IF NOT EXISTS "FiltersJson" text;
        ALTER TABLE "ScheduledReports" ADD COLUMN IF NOT EXISTS "SendHour" integer NOT NULL DEFAULT 8;

        -- WaitlistEntries: public anonymous sign-up support
        ALTER TABLE "WaitlistEntries" ALTER COLUMN "CustomerId" DROP NOT NULL;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "CustomerName"      text NOT NULL DEFAULT '';
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "CustomerPhone"     text;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "CustomerEmail"     text;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "Source"            text NOT NULL DEFAULT 'panel';
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "PreferredTimeFrom" text;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "PreferredTimeTo"   text;

        -- WaitlistEntries: separate first/last name for proper customer creation
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "CustomerFirstName" text;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "CustomerLastName"  text;

        -- WaitlistEntries: waiting type + offer system
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "WaitingType"    text NOT NULL DEFAULT 'flexible';
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "OfferedStartAt" timestamptz;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "OfferedEndAt"   timestamptz;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "OfferToken"     uuid;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "OfferExpiresAt" timestamptz;
        ALTER TABLE "WaitlistEntries" ADD COLUMN IF NOT EXISTS "DeclineNote"    text;
        CREATE INDEX IF NOT EXISTS ix_waitlist_offertoken ON "WaitlistEntries"("OfferToken") WHERE "OfferToken" IS NOT NULL;

        -- Packages system
        CREATE TABLE IF NOT EXISTS "Packages" (
            "Id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            "SalonId"     uuid        NOT NULL REFERENCES "Salons"("Id") ON DELETE CASCADE,
            "Name"        text        NOT NULL,
            "Description" text,
            "TotalPrice"  numeric(10,2) NOT NULL DEFAULT 0,
            "IsActive"    boolean     NOT NULL DEFAULT true,
            "IsTimeLimited" boolean   NOT NULL DEFAULT false,
            "ValidFrom"   timestamptz,
            "ValidTo"     timestamptz,
            "CreatedAtUtc" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_packages_salon ON "Packages"("SalonId");

        CREATE TABLE IF NOT EXISTS "PackageItems" (
            "Id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            "PackageId"   uuid        NOT NULL REFERENCES "Packages"("Id") ON DELETE CASCADE,
            "ItemType"    text        NOT NULL DEFAULT 'service',
            "ReferenceId" uuid,
            "ItemName"    text        NOT NULL,
            "Quantity"    integer     NOT NULL DEFAULT 1,
            "UnitPrice"   numeric(10,2) NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS ix_packageitems_package ON "PackageItems"("PackageId");

        -- SuperAdmin internal note on Salons
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Salons' AND column_name='SaNote') THEN
                ALTER TABLE "Salons" ADD COLUMN "SaNote" text;
            END IF;
        END $$;

        """;
}

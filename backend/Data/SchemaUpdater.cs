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

        """;
}

-- Notificações antigas (só ambiente de desenvolvimento) não têm tenant/cliente: descarta antes de exigir as colunas.
DELETE FROM "notifications";

-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'SKIPPED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'WAITLIST';
ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE';

-- DropIndex
DROP INDEX "notifications_status_created_at_idx";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "whatsapp_opt_out_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "client_id" TEXT NOT NULL,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "scheduled_for" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tenant_id" TEXT NOT NULL,
ALTER COLUMN "booking_id" DROP NOT NULL,
DROP COLUMN "payload",
ADD COLUMN     "payload" JSONB;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "no_show_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminder_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "whatsapp_phone_number_id" TEXT;

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "barber_id" TEXT,
    "date" DATE NOT NULL,
    "notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_tenant_id_date_idx" ON "waitlist_entries"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_client_id_service_id_date_key" ON "waitlist_entries"("client_id", "service_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_external_id_key" ON "notifications"("external_id");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_created_at_idx" ON "notifications"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_whatsapp_phone_number_id_key" ON "tenants"("whatsapp_phone_number_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "tenants" ADD CONSTRAINT "tenants_reminder_noshow_valid" CHECK ("reminder_hours" BETWEEN 0 AND 168 AND "no_show_limit" BETWEEN 0 AND 20);

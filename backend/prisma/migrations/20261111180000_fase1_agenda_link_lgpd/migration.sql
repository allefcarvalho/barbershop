-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'PANEL', 'WALK_IN');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "manage_token_hash" TEXT,
ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "require_confirmation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_manage_token_hash_key" ON "bookings"("manage_token_hash");


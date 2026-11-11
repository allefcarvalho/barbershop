-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT', 'DEBIT', 'CASH');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "product_commission_pct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "service_commission_pct" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "register_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "client_id" TEXT,
    "barber_id" TEXT,
    "subtotal_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "tip_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PAID',
    "created_by_id" TEXT NOT NULL,
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "kind" "OrderItemKind" NOT NULL,
    "service_id" TEXT,
    "product_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "commission_cents" INTEGER NOT NULL DEFAULT 0,
    "commission_paid_at" TIMESTAMPTZ(3),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_cents" INTEGER NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "opened_by_id" TEXT NOT NULL,
    "opening_cents" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "counted_cash_cents" INTEGER,
    "notes" TEXT,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "register_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_booking_id_key" ON "orders"("booking_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_created_at_idx" ON "orders"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_register_id_idx" ON "orders"("register_id");

-- CreateIndex
CREATE INDEX "orders_barber_id_created_at_idx" ON "orders"("barber_id", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "cash_registers_tenant_id_opened_at_idx" ON "cash_registers"("tenant_id", "opened_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================
-- Regras garantidas pelo banco
-- =============================================

-- Só um caixa aberto por barbearia (dois "abrir caixa" simultâneos não criam dois).
CREATE UNIQUE INDEX "cash_registers_one_open_per_tenant" ON "cash_registers"("tenant_id") WHERE "closed_at" IS NULL;

ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_valid" CHECK (
  "subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "discount_cents" <= "subtotal_cents"
  AND "tip_cents" >= 0 AND "total_cents" = "subtotal_cents" - "discount_cents" + "tip_cents"
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_valid" CHECK (
  "quantity" > 0 AND "unit_price_cents" >= 0 AND "total_cents" >= 0 AND "commission_cents" >= 0
  AND ("kind" = 'SERVICE') = ("service_id" IS NOT NULL) AND ("kind" = 'PRODUCT') = ("product_id" IS NOT NULL)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_amounts_valid" CHECK ("opening_cents" >= 0 AND ("counted_cash_cents" IS NULL OR "counted_cash_cents" >= 0));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_commission_pct_valid" CHECK (
  "service_commission_pct" BETWEEN 0 AND 100 AND "product_commission_pct" BETWEEN 0 AND 100
);

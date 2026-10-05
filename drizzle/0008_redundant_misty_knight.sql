CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'MANUAL', 'TEST');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('COMPLETED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'INVOICE_ISSUED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PAYMENT_RECORDED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REFUND_RECORDED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'PARTIALLY_REFUNDED';--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"hospital_id" uuid,
	"appointment_id" uuid NOT NULL,
	"currency" varchar(10) DEFAULT 'PKR' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"amount_refunded" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"status" "invoice_status" DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'COMPLETED' NOT NULL,
	"method" "payment_method" NOT NULL,
	"processed_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "currency" SET DEFAULT 'PKR';--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "payment_method" SET DATA TYPE "public"."payment_method" USING "payment_method"::"public"."payment_method";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "payment_method" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_number" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" varchar(100);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recorded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_appointment_unique" ON "invoices" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "invoices_patient_created_idx" ON "invoices" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_hospital_created_idx" ON "invoices" USING btree ("hospital_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_status_created_idx" ON "invoices" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "refunds_payment_created_idx" ON "refunds" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "refunds_invoice_created_idx" ON "refunds" USING btree ("invoice_id","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_invoice_created_idx" ON "payments" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_number_unique" ON "payments" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_invoice_idempotency_unique" ON "payments" USING btree ("invoice_id","idempotency_key");
-- Phase 12: atomic, gap-tolerant counter for human-readable invoice numbers
-- (MED-<year>-<seq>). A DB sequence guarantees no two concurrent invoice
-- creations can ever get the same number, without a SELECT ... FOR UPDATE
-- on a counter row. The unique index on invoices.invoice_number (above) is
-- the final safety net if this were ever bypassed.
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START WITH 1 INCREMENT BY 1;

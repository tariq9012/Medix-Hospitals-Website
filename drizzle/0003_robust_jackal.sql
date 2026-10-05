CREATE TYPE "public"."provider_type" AS ENUM('DOCTOR', 'HOSPITAL');--> statement-breakpoint
ALTER TYPE "public"."verification_status" ADD VALUE 'SUSPENDED';--> statement-breakpoint
CREATE TABLE "hospital_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hospital_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospital_admins_user_hospital_unique" UNIQUE("user_id","hospital_id")
);
--> statement-breakpoint
CREATE TABLE "provider_verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_type" "provider_type" NOT NULL,
	"provider_id" uuid NOT NULL,
	"previous_status" "verification_status" NOT NULL,
	"new_status" "verification_status" NOT NULL,
	"reason" text,
	"reviewed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "appointments_status_idx";--> statement-breakpoint
ALTER TABLE "doctors" ADD COLUMN "verification_reason" text;--> statement-breakpoint
ALTER TABLE "doctors" ADD COLUMN "verification_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN "verification_reason" text;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN "verification_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hospital_admins" ADD CONSTRAINT "hospital_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_admins" ADD CONSTRAINT "hospital_admins_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_verification_events" ADD CONSTRAINT "provider_verification_events_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hospital_admins_user_idx" ON "hospital_admins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hospital_admins_hospital_idx" ON "hospital_admins" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "provider_verification_events_provider_idx" ON "provider_verification_events" USING btree ("provider_type","provider_id");--> statement-breakpoint
CREATE INDEX "provider_verification_events_created_idx" ON "provider_verification_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_role_status_idx" ON "users" USING btree ("role","status");--> statement-breakpoint
CREATE INDEX "doctors_verification_status_idx" ON "doctors" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "hospitals_verification_status_idx" ON "hospitals" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "appointments_status_date_idx" ON "appointments" USING btree ("status","appointment_date");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");
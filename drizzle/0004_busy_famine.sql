CREATE TABLE "hospital_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(170) NOT NULL,
	"description" text,
	"phone_extension" varchar(30),
	"location" varchar(150),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospital_departments_hospital_slug_unique" UNIQUE("hospital_id","slug")
);
--> statement-breakpoint
CREATE TABLE "hospital_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(170) NOT NULL,
	"description" text,
	"category" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospital_services_hospital_slug_unique" UNIQUE("hospital_id","slug")
);
--> statement-breakpoint
ALTER TABLE "hospital_departments" ADD CONSTRAINT "hospital_departments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_services" ADD CONSTRAINT "hospital_services_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hospital_departments_hospital_active_idx" ON "hospital_departments" USING btree ("hospital_id","is_active");--> statement-breakpoint
CREATE INDEX "hospital_services_hospital_active_idx" ON "hospital_services" USING btree ("hospital_id","is_active");--> statement-breakpoint
CREATE INDEX "hospital_doctors_hospital_idx" ON "hospital_doctors" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "hospital_doctors_doctor_idx" ON "hospital_doctors" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "appointments_hospital_date_idx" ON "appointments" USING btree ("hospital_id","appointment_date");
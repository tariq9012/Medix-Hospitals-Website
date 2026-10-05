ALTER TABLE "medical_documents" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."document_category";--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('LAB_REPORT', 'IMAGING_REPORT', 'DIAGNOSTIC_REPORT', 'DISCHARGE_SUMMARY', 'REFERRAL', 'CLINICAL_ATTACHMENT', 'OTHER');--> statement-breakpoint
ALTER TABLE "medical_documents" DROP COLUMN "file_url";--> statement-breakpoint
ALTER TABLE "medical_documents" DROP COLUMN "visibility";--> statement-breakpoint
DROP TYPE "public"."document_visibility";--> statement-breakpoint
ALTER TABLE "medical_documents" DROP COLUMN "uploaded_at";--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "doctor_id" uuid;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "medical_record_id" uuid;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "hospital_id" uuid;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "document_type" "public"."document_category" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "original_filename" varchar(255) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "medical_documents" ALTER COLUMN "original_filename" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "storage_key" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "medical_documents" ALTER COLUMN "storage_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "mime_type" varchar(100) NOT NULL DEFAULT 'application/octet-stream';--> statement-breakpoint
ALTER TABLE "medical_documents" ALTER COLUMN "mime_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "file_size" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "medical_documents" ALTER COLUMN "file_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD COLUMN "checksum" varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "medical_documents" ALTER COLUMN "checksum" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_medical_record_id_medical_records_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medical_documents_patient_date_idx" ON "medical_documents" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "medical_documents_doctor_date_idx" ON "medical_documents" USING btree ("doctor_id","created_at");--> statement-breakpoint
CREATE INDEX "medical_documents_appointment_idx" ON "medical_documents" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "medical_documents_medical_record_idx" ON "medical_documents" USING btree ("medical_record_id");

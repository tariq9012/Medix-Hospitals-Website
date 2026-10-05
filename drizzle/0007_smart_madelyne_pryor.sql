ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'SYSTEM'::text;--> statement-breakpoint
DROP TYPE "public"."notification_type";--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('APPOINTMENT_CONFIRMED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_REMINDER', 'PRESCRIPTION_AVAILABLE', 'MEDICAL_RECORD_AVAILABLE', 'MEDICAL_DOCUMENT_AVAILABLE', 'NEW_MESSAGE', 'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'VERIFICATION_SUSPENDED', 'PAYMENT_CONFIRMATION', 'SYSTEM');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'SYSTEM'::"public"."notification_type";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "public"."notification_type" USING "type"::"public"."notification_type";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "patient_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "doctor_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_participants_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_patient_doctor_unique" ON "conversations" USING btree ("patient_id","doctor_id");--> statement-breakpoint
CREATE INDEX "conversations_doctor_idx" ON "conversations" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_read_idx" ON "messages" USING btree ("conversation_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read_at","created_at");
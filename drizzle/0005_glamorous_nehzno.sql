ALTER TABLE "medical_records" ADD COLUMN "hospital_id" uuid;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "chief_complaint" text;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "treatment_plan" text;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "follow_up_instructions" text;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "follow_up_date" date;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD COLUMN "route" varchar(50);--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "medical_record_id" uuid;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "hospital_id" uuid;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medical_record_id_medical_records_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medical_records_appointment_unique" ON "medical_records" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "medical_records_patient_date_idx" ON "medical_records" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "medical_records_doctor_date_idx" ON "medical_records" USING btree ("doctor_id","created_at");--> statement-breakpoint
CREATE INDEX "prescription_items_prescription_idx" ON "prescription_items" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "prescriptions_appointment_idx" ON "prescriptions" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_date_idx" ON "prescriptions" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "prescriptions_doctor_date_idx" ON "prescriptions" USING btree ("doctor_id","created_at");
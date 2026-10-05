CREATE INDEX "doctor_availability_doctor_day_idx" ON "doctor_availability" USING btree ("doctor_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_doctor_slot_unique" ON "appointments" USING btree ("doctor_id","appointment_date","start_time") WHERE "appointments"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "appointments_doctor_date_idx" ON "appointments" USING btree ("doctor_id","appointment_date");--> statement-breakpoint
CREATE INDEX "appointments_patient_date_idx" ON "appointments" USING btree ("patient_id","appointment_date");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");
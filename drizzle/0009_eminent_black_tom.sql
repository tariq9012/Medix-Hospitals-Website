ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doctor_specialties_specialty_idx" ON "doctor_specialties" USING btree ("specialty_id");--> statement-breakpoint
CREATE INDEX "hospital_specialties_specialty_idx" ON "hospital_specialties" USING btree ("specialty_id");--> statement-breakpoint
CREATE INDEX "reviews_doctor_status_created_idx" ON "reviews" USING btree ("doctor_id","moderation_status","created_at");--> statement-breakpoint
CREATE INDEX "reviews_hospital_status_idx" ON "reviews" USING btree ("hospital_id","moderation_status");--> statement-breakpoint
CREATE INDEX "reviews_patient_idx" ON "reviews" USING btree ("patient_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_text_length" CHECK ("reviews"."review_text" IS NULL OR char_length("reviews"."review_text") <= 2000);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_has_timestamp" CHECK ("reviews"."moderation_status" <> 'HIDDEN' OR "reviews"."hidden_at" IS NOT NULL);
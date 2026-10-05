/**
 * Timezone convention for this app: every appointment date/time is stored
 * and reasoned about as the doctor/clinic's own local "wall clock" time —
 * a Postgres `date` + `time` pair with no UTC conversion applied anywhere
 * in the stack (client, server, or database). This matches Medix's current
 * single-timezone deployment (Pakistan) and avoids an entire class of
 * off-by-N-hours bugs that come from mixing UTC and local time. If Medix
 * ever serves clinics across multiple timezones, the right fix is adding an
 * explicit `timezone` column to `hospitals`/`doctors` and converting at the
 * display layer — not changing how times are stored.
 */

export interface BookableDoctorSummary {
  id: string;
  slug: string;
  name: string;
  profileImage: string | null;
  specialty: string | null;
  consultationFee: string | null;
  rating: string;
  totalReviews: number;
  yearsOfExperience: number | null;
}

export interface BookableDoctorDetail extends BookableDoctorSummary {
  biography: string | null;
  hospitals: { id: string; name: string; slug: string; city: string | null }[];
}

export interface AvailableSlot {
  startTime: string; // "HH:MM" (24h, doctor/clinic local time)
  endTime: string;
  available: boolean;
}

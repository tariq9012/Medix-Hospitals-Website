/**
 * Public-safe DTOs for the provider directory. These are the ONLY shapes the
 * public pages ever receive — never a raw DB row. Notably absent by design:
 * user email, password/session data, license numbers, verification reasons
 * or history, audit data, patient data, billing, and internal admin fields.
 */

export type ConsultationMode = "ONLINE" | "IN_PERSON";

export interface PublicSpecialtyRef {
  name: string;
  slug: string;
  isPrimary: boolean;
}

export interface PublicHospitalRef {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  department: string | null;
  isPrimary: boolean;
}

export interface PublicDoctorCard {
  id: string;
  slug: string;
  name: string;
  profileImage: string | null;
  primarySpecialty: string | null;
  specialties: PublicSpecialtyRef[];
  qualifications: string[];
  yearsOfExperience: number | null;
  /** Decimal string as stored (e.g. "2500.00"); null when the doctor hasn't set a fee. */
  consultationFee: string | null;
  /** null when the doctor has no visible reviews yet — never a fake 0.0. */
  rating: number | null;
  reviewCount: number;
  hospitals: PublicHospitalRef[];
  modes: ConsultationMode[];
  /** True when the doctor currently publishes at least one active weekly availability rule. */
  hasSchedule: boolean;
  /** null = viewer isn't a signed-in patient (no favorite affordance). */
  isFavorite: boolean | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ScheduleWindow {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  consultationType: ConsultationMode;
  hospitalName: string | null;
}

export interface PublicDoctorDetail extends PublicDoctorCard {
  biography: string | null;
  schedule: ScheduleWindow[];
  /** First genuinely bookable slot within the next 14 days, from the real availability engine; null if none. */
  nextAvailable: { date: string; startTime: string } | null;
  ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface PublicHospitalCard {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  coverImage: string | null;
  city: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number;
  doctorCount: number;
  specialties: string[];
  departments: string[];
  isFavorite: boolean | null;
}

export interface PublicHospitalDetail extends PublicHospitalCard {
  description: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  openingHours: Record<string, { open: string; close: string }> | null;
  facilities: string[];
  departmentDetails: { name: string; description: string | null; location: string | null }[];
  services: { name: string; description: string | null; category: string | null }[];
  doctors: PublicDoctorCard[];
  doctorDepartments: Record<string, string | null>;
  ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface PublicSpecialtySummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  doctorCount: number;
  hospitalCount: number;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  /** Privacy-conscious display name, e.g. "Tariq K." */
  reviewerName: string;
  createdAt: string;
  edited: boolean;
}

export interface HomepageReview extends PublicReview {
  doctorName: string;
  doctorSlug: string;
}

export interface DirectoryViewer {
  userId: string;
  role: "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "ADMIN";
}

export interface DoctorFilterOptions {
  specialties: { name: string; slug: string }[];
  cities: string[];
  hospitals: { name: string; slug: string }[];
}

export interface HospitalFilterOptions {
  specialties: { name: string; slug: string }[];
  cities: string[];
  departments: string[];
  services: string[];
}

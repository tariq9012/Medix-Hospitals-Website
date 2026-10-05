export type Role = "patient" | "doctor" | "hospital" | "admin";

export type AppointmentType = "video" | "in-person";
export type AppointmentStatus = "confirmed" | "pending" | "completed" | "cancelled" | "waiting";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded";
export type VerificationStatus = "pending" | "approved" | "rejected";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  qualification: string;
  experience: number;
  rating: number;
  reviews: number;
  fee: number;
  gender: "male" | "female";
  city: string;
  hospitalId: string;
  hospital: string;
  online: boolean;
  inPerson: boolean;
  verified: boolean;
  image: string;
  languages: string[];
  about: string;
  nextAvailable: string;
  services: { name: string; description: string; price: number }[];
  education: { degree: string; institute: string; year: string }[];
  timeline: { role: string; place: string; period: string; detail: string }[];
}

export interface Hospital {
  id: string;
  name: string;
  city: string;
  address: string;
  rating: number;
  reviews: number;
  verified: boolean;
  image: string;
  beds: number;
  availableBeds: number;
  phone: string;
  email: string;
  about: string;
  departments: string[];
  facilities: string[];
  doctorCount: number;
}

export interface Appointment {
  id: string;
  patient: string;
  patientId: string;
  doctorId: string;
  doctor: string;
  specialty: string;
  hospital: string;
  date: string;
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  payment: PaymentStatus;
  fee: number;
  reason: string;
}

export interface Prescription {
  id: string;
  doctor: string;
  specialty: string;
  patient: string;
  date: string;
  status: "active" | "completed";
  instructions: string;
  medicines: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    note: string;
  }[];
}

export interface MedicalReport {
  id: string;
  name: string;
  category: "Blood Test" | "X-Ray" | "MRI" | "CT Scan" | "Prescription" | "Other";
  date: string;
  doctor: string;
  fileType: "PDF" | "JPG" | "DICOM";
  size: string;
}

export interface Conversation {
  id: string;
  name: string;
  role: string;
  avatar: string;
  last: string;
  time: string;
  unread: number;
  messages: { id: string; from: "me" | "them"; text: string; time: string }[];
}

export interface Review {
  id: string;
  author: string;
  avatar: string;
  target: string;
  targetType: "doctor" | "hospital";
  rating: number;
  date: string;
  text: string;
  status: "published" | "hidden" | "pending";
}

export interface Payment {
  id: string;
  patient: string;
  doctor: string;
  amount: number;
  date: string;
  method: string;
  status: PaymentStatus;
}

export interface Article {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  body: string[];
  author: string;
  date: string;
  readTime: string;
  image: string;
  status: "published" | "draft";
  featured?: boolean;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: "Male" | "Female";
  phone: string;
  email: string;
  city: string;
  lastVisit: string;
  visits: number;
  status: "active" | "inactive";
  allergies: string[];
  conditions: string[];
}

export interface NotificationItem {
  id: string;
  type:
    "appointment" | "reminder" | "cancelled" | "message" | "prescription" | "report" | "payment";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

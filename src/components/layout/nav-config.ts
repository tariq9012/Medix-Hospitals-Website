import {
  Activity,
  BadgeCheck,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  FlaskConical,
  FolderHeart,
  Heart,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Newspaper,
  Pill,
  Settings,
  ShieldCheck,
  Star,
  Stethoscope,
  Users,
  Wallet,
  BedDouble,
  CalendarClock,
  Layers,
  UserCog,
  ScrollText,
  Search,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const patientNav: NavItem[] = [
  { label: "Dashboard", to: "/patient/dashboard", icon: LayoutDashboard },
  { label: "Find Doctors", to: "/doctors", icon: Search },
  { label: "Find Hospitals", to: "/hospitals", icon: Building2 },
  { label: "My Appointments", to: "/patient/appointments", icon: CalendarDays },
  { label: "Medical History", to: "/patient/medical-history", icon: FolderHeart },
  { label: "Prescriptions", to: "/patient/prescriptions", icon: Pill },
  { label: "Lab Reports", to: "/patient/reports", icon: FlaskConical },
  { label: "Messages", to: "/patient/messages", icon: MessageSquare },
  { label: "Favorites", to: "/patient/favorites", icon: Heart },
  { label: "Reviews", to: "/patient/reviews", icon: Star },
  { label: "Payments", to: "/patient/payments", icon: CreditCard },
  { label: "Notifications", to: "/patient/notifications", icon: Bell },
  { label: "Settings", to: "/patient/settings", icon: Settings },
];

export const doctorNav: NavItem[] = [
  { label: "Dashboard", to: "/doctor/dashboard", icon: LayoutDashboard },
  { label: "Profile", to: "/doctor/profile", icon: UserCog },
  { label: "Appointments", to: "/doctor/appointments", icon: CalendarDays },
  { label: "Availability", to: "/doctor/availability", icon: CalendarClock },
  { label: "Patients", to: "/doctor/patients", icon: Users },
  { label: "Medical Records", to: "/doctor/records", icon: FolderHeart },
  { label: "Prescriptions", to: "/doctor/prescriptions", icon: Pill },
  { label: "Reports", to: "/doctor/reports", icon: FileText },
  { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
  { label: "Notifications", to: "/doctor/notifications", icon: Bell },
  { label: "Earnings", to: "/doctor/earnings", icon: Wallet },
  { label: "Reviews", to: "/doctor/reviews", icon: Star },
  { label: "Analytics", to: "/doctor/analytics", icon: Activity },
  { label: "Settings", to: "/doctor/settings", icon: Settings },
];

export const hospitalNav: NavItem[] = [
  { label: "Dashboard", to: "/hospital/dashboard", icon: LayoutDashboard },
  { label: "Hospital Profile", to: "/hospital/profile", icon: Building2 },
  { label: "Departments", to: "/hospital/departments", icon: Layers },
  { label: "Doctors", to: "/hospital/doctors", icon: Stethoscope },
  { label: "Staff", to: "/hospital/staff", icon: Users },
  { label: "Appointments", to: "/hospital/appointments", icon: CalendarDays },
  { label: "Billing", to: "/hospital/billing", icon: CreditCard },
  { label: "Patients", to: "/hospital/patients", icon: ClipboardList },
  { label: "Schedules", to: "/hospital/schedules", icon: CalendarClock },
  { label: "Rooms & Beds", to: "/hospital/rooms-beds", icon: BedDouble },
  { label: "Services", to: "/hospital/services", icon: FolderHeart },
  { label: "Analytics", to: "/hospital/analytics", icon: FileBarChart },
  { label: "Settings", to: "/hospital/settings", icon: Settings },
];

export const adminNav: NavItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Patients", to: "/admin/patients", icon: Users },
  { label: "Doctors", to: "/admin/doctors", icon: Stethoscope },
  { label: "Hospitals", to: "/admin/hospitals", icon: Building2 },
  { label: "Departments", to: "/admin/departments", icon: Layers },
  { label: "Specializations", to: "/admin/specializations", icon: BadgeCheck },
  { label: "Appointments", to: "/admin/appointments", icon: CalendarDays },
  { label: "Payments", to: "/admin/payments", icon: CreditCard },
  { label: "Reviews", to: "/admin/reviews", icon: Star },
  { label: "Reports", to: "/admin/reports", icon: FileBarChart },
  { label: "Doctor Verification", to: "/admin/doctor-verification", icon: ShieldCheck },
  { label: "Hospital Verification", to: "/admin/hospital-verification", icon: ShieldCheck },
  { label: "Articles", to: "/admin/articles", icon: Newspaper },
  { label: "Notifications", to: "/admin/notifications", icon: Bell },
  { label: "Activity Logs", to: "/admin/activity-logs", icon: ScrollText },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

export const roleMeta = {
  patient: { title: "Patient", nav: patientNav, name: "Tariq Khan", subtitle: "Patient account" },
  doctor: { title: "Doctor", nav: doctorNav, name: "Dr. Ahmed Raza", subtitle: "Cardiology" },
  hospital: {
    title: "Hospital",
    nav: hospitalNav,
    name: "Medix Central",
    subtitle: "Hospital admin",
  },
  admin: { title: "Admin", nav: adminNav, name: "Medix Admin", subtitle: "Platform operations" },
} as const;

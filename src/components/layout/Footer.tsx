import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Twitter } from "lucide-react";

import { Logo } from "@/components/brand/Logo";

const groups: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "For Patients",
    links: [
      { label: "Find Doctors", to: "/doctors" },
      { label: "Find Hospitals", to: "/hospitals" },
      { label: "Book Appointment", to: "/book" },
      { label: "Patient Dashboard", to: "/patient/dashboard" },
    ],
  },
  {
    title: "For Doctors",
    links: [
      { label: "Doctor Dashboard", to: "/doctor/dashboard" },
      { label: "Manage Schedule", to: "/doctor/availability" },
      { label: "Earnings", to: "/doctor/earnings" },
      { label: "Join Medix", to: "/register" },
    ],
  },
  {
    title: "For Hospitals",
    links: [
      { label: "Hospital Dashboard", to: "/hospital/dashboard" },
      { label: "Departments", to: "/hospital/departments" },
      { label: "Rooms & Beds", to: "/hospital/rooms-beds" },
      { label: "Analytics", to: "/hospital/analytics" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Health Articles", to: "/articles" },
      { label: "About Medix", to: "/about" },
      { label: "Support", to: "/contact" },
      { label: "Admin Console", to: "/admin/dashboard" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm text-muted-foreground">
              Medix helps patients discover verified doctors and hospitals, book appointments and
              keep every prescription, report and consultation in one secure place.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Phone className="size-4 text-primary" aria-hidden="true" /> +92 21 111 63349
              </li>
              <li className="flex items-center gap-2">
                <Mail className="size-4 text-primary" aria-hidden="true" /> support@medix.health
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" aria-hidden="true" /> Shahrah-e-Faisal,
                Karachi
              </li>
            </ul>
            <div className="mt-5 flex items-center gap-2">
              {[Twitter, Facebook, Instagram, Linkedin].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label={["Twitter", "Facebook", "Instagram", "LinkedIn"][i]}
                  className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Icon className="size-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Medix Health. Demo product — not for clinical use.</p>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
            <Link to="/contact" className="transition-colors hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

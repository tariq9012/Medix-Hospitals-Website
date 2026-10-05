import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { roleMeta, type NavItem } from "@/components/layout/nav-config";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logoutFn } from "@/lib/auth/functions";
import { useUnreadNotificationCount } from "@/lib/notifications/useUnreadCount";
import { getRealtimeClient, useRealtimeConnection } from "@/lib/realtime/client";
import type { Role } from "@/types";
import { cn } from "@/lib/utils";

/** Only roles with a real notification center get a live/clickable bell. */
const NOTIFICATIONS_PATH: Partial<Record<Role, string>> = {
  patient: "/patient/notifications",
  doctor: "/doctor/notifications",
  admin: "/admin/notifications",
};

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Dashboard">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeProps={{
            className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
          }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function DashboardLayout({
  role,
  children,
  user,
}: {
  role: Role;
  children: ReactNode;
  /** Real authenticated identity, when the caller has it. Falls back to the
   * static `roleMeta` placeholder (used by the "Coming soon" stub pages,
   * which don't need a real user to render). */
  user?: { name?: string; subtitle?: string };
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const meta = roleMeta[role];
  const displayName = user?.name || meta.name;
  const displaySubtitle = user?.subtitle || meta.subtitle;
  const unreadCount = useUnreadNotificationCount();
  const realtimeStatus = useRealtimeConnection();
  const notificationsPath = NOTIFICATIONS_PATH[role];
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  async function handleLogout() {
    // Close the live stream first so it can't outlive the session it authenticated with.
    getRealtimeClient().shutdown();
    await logoutFn();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {meta.title} workspace
          </p>
          <NavList items={meta.nav} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" aria-hidden="true" /> Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[84vw] max-w-xs p-0">
              <SheetHeader className="border-b border-border px-5 py-4">
                <SheetTitle className="text-left">
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto px-3 py-4">
                <NavList items={meta.nav} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="relative hidden max-w-sm flex-1 md:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input placeholder="Search Medix…" className="pl-9" aria-label="Search" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Truthful, low-key: shown ONLY while the live stream is down and retrying. */}
            {realtimeStatus === "reconnecting" && (
              <span
                role="status"
                className="hidden text-xs text-muted-foreground sm:inline"
                data-testid="realtime-reconnecting"
              >
                Live updates paused — reconnecting…
              </span>
            )}
            {notificationsPath && (
              <Button variant="ghost" size="icon" asChild aria-label="Notifications">
                <Link to={notificationsPath} className="relative">
                  <Bell className="size-5" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold leading-none text-destructive-foreground"
                      aria-label={`${unreadCount} unread notifications`}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
              </Button>
            )}
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-[11px] text-muted-foreground">{displaySubtitle}</p>
              </div>
            </div>
          </div>
        </header>

        <main className={cn("px-4 py-6 md:px-6 lg:py-8")}>{children}</main>
      </div>
    </div>
  );
}

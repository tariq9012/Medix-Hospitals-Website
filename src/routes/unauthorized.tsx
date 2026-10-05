import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { getCurrentUserFn } from "@/lib/auth/functions";
import { dashboardPathForRole } from "@/lib/auth/roles";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Access denied — Medix" },
      { name: "description", content: "You don't have permission to view this page." },
    ],
  }),
  loader: async () => {
    const user = await getCurrentUserFn();
    return { homePath: user ? dashboardPathForRole(user.role) : "/" };
  },
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  const { homePath } = Route.useLoaderData();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account doesn't have permission to view that page. If you think this is a mistake,
          contact support.
        </p>
        <div className="mt-6">
          <Link
            to={homePath}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to your dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

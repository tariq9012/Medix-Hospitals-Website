import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/common";
import { ExistingReview } from "@/components/directory/ReviewPanel";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyReviewsFn, removeReviewFn, restoreReviewFn } from "@/lib/reviews/functions";
import type { MyReview } from "@/lib/reviews/queries.server";

export const Route = createFileRoute("/patient/reviews")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  head: () => ({
    meta: [
      { title: "My Reviews — Medix" },
      { name: "description", content: "Reviews you've left after completed appointments." },
    ],
  }),
  component: PatientReviews,
});

function PatientReviews() {
  const { user } = Route.useRouteContext();
  const [reviews, setReviews] = useState<MyReview[] | null>(null);

  const load = useCallback(() => {
    listMyReviewsFn()
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, ok: string) {
    const r = await fn();
    if (r.ok) {
      toast.success(ok);
      load();
    } else toast.error(r.message);
  }

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="My reviews"
        description="Reviews you've left after completed appointments."
      />
      {reviews === null ? null : reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews yet"
          description="After a completed appointment you can leave a review from the appointment page."
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-5">
                <div className="text-sm">
                  <span className="font-medium">{r.doctorName ?? "Doctor"}</span>
                  {r.hospitalName && (
                    <span className="text-muted-foreground"> · {r.hospitalName}</span>
                  )}
                  {r.appointmentId && (
                    <Link
                      to="/patient/appointments/$id"
                      params={{ id: r.appointmentId }}
                      className="ml-3 text-xs text-primary hover:underline"
                    >
                      View appointment
                    </Link>
                  )}
                </div>
                <ExistingReview
                  review={r}
                  onEdit={() => {
                    if (r.appointmentId)
                      window.location.assign(`/patient/appointments/${r.appointmentId}`);
                  }}
                  onRemove={() =>
                    confirm("Remove your review? It will no longer be shown publicly.") &&
                    void run(() => removeReviewFn({ data: { reviewId: r.id } }), "Review removed.")
                  }
                  onRestore={() =>
                    void run(
                      () => restoreReviewFn({ data: { reviewId: r.id } }),
                      "Review restored.",
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

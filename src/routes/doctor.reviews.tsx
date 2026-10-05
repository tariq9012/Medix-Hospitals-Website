import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState, ErrorState, PageHeader, Pagination, RatingSummary } from "@/components/common";
import { Stars } from "@/components/directory/Stars";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { formatDate } from "@/lib/format";
import { getMyDoctorReviewsFn } from "@/lib/reviews/functions";

export const Route = createFileRoute("/doctor/reviews")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Reviews — Medix" },
      { name: "description", content: "Patient reviews of your care." },
    ],
  }),
  component: DoctorReviews,
});

type Data = Awaited<ReturnType<typeof getMyDoctorReviewsFn>>;

function DoctorReviews() {
  const { user } = Route.useRouteContext();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getMyDoctorReviewsFn({ data: { page } })
      .then(setData)
      .catch(() => setFailed(true));
  }, [page]);
  useEffect(load, [load]);

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Reviews"
        description="Patient reviews of your care. Reviews come only from completed appointments and can't be edited or removed by providers."
        actions={
          data ? (
            <RatingSummary
              rating={data.stats.rating}
              reviewCount={data.stats.reviewCount}
              size="md"
            />
          ) : undefined
        }
      />
      {failed ? (
        <ErrorState onRetry={load} />
      ) : data === null ? null : data.list.items.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews yet"
          description="Reviews will appear after patients complete appointments."
        />
      ) : (
        <div className="space-y-3">
          {data.list.items.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-1.5 p-5">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{r.reviewerName}</span>
                  <Stars value={r.rating} />
                  <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                </div>
                {r.comment && (
                  <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                    {r.comment}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          <Pagination page={data.list.page} totalPages={data.list.totalPages} onChange={setPage} />
        </div>
      )}
    </DashboardLayout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/common";
import { Stars } from "@/components/directory/Stars";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { formatDate } from "@/lib/format";
import {
  adminHideReviewFn,
  adminListReviewsFn,
  adminRestoreReviewFn,
} from "@/lib/reviews/functions";

export const Route = createFileRoute("/admin/reviews")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Review moderation — Medix" },
      { name: "description", content: "Moderate doctor and hospital reviews." },
    ],
  }),
  component: AdminReviews,
});

type Page = Awaited<ReturnType<typeof adminListReviewsFn>>;
type Status = "ALL" | "PUBLISHED" | "HIDDEN";

function AdminReviews() {
  const { user } = Route.useRouteContext();
  const [status, setStatus] = useState<Status>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const [hiding, setHiding] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    adminListReviewsFn({ data: { status, page } })
      .then(setData)
      .catch(() => setFailed(true));
  }, [status, page]);
  useEffect(load, [load]);

  async function restore(reviewId: string) {
    const r = await adminRestoreReviewFn({ data: { reviewId } });
    if (r.ok) {
      toast.success("Review restored.");
      load();
    } else toast.error(r.message);
  }

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader
        title="Review moderation"
        description="Hide a review only for a clear policy reason. Hidden reviews are kept, never deleted, and every action is audited. Admins cannot edit review content."
        actions={
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as Status);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All reviews</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="HIDDEN">Hidden</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      {failed ? (
        <ErrorState onRetry={load} />
      ) : data === null ? null : data.items.length === 0 ? (
        <EmptyState icon={Star} title="No reviews" description="Nothing matches this filter." />
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-5">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Stars value={r.rating} />
                  <span className="font-medium">{r.reviewerName}</span>
                  <span className="text-muted-foreground">
                    on {r.doctorName ?? "—"}
                    {r.hospitalName ? ` · ${r.hospitalName}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                  <Badge variant={r.status === "PUBLISHED" ? "secondary" : "outline"}>
                    {r.status === "HIDDEN"
                      ? r.hiddenBy === "PATIENT"
                        ? "Removed by patient"
                        : "Hidden by moderation"
                      : r.status.toLowerCase()}
                  </Badge>
                </div>
                {r.comment && (
                  <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                    {r.comment}
                  </p>
                )}
                {r.hiddenReason && (
                  <p className="text-xs text-muted-foreground">
                    Moderation reason: {r.hiddenReason}
                  </p>
                )}
                <div className="pt-1">
                  {r.status === "PUBLISHED" && (
                    <Button variant="outline" size="sm" onClick={() => setHiding(r.id)}>
                      Hide review
                    </Button>
                  )}
                  {r.status === "HIDDEN" && r.hiddenBy === "ADMIN" && (
                    <Button variant="outline" size="sm" onClick={() => void restore(r.id)}>
                      Restore
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}

      <AdminConfirmDialog
        open={hiding !== null}
        onOpenChange={(o) => !o && setHiding(null)}
        title="Hide this review?"
        description="It will disappear from public pages and ratings. The review and its history are preserved, and this action is recorded in the audit log."
        confirmLabel="Hide review"
        destructive
        requiresReason
        onConfirm={async (reason) => {
          const r = await adminHideReviewFn({ data: { reviewId: hiding!, reason: reason ?? "" } });
          if (r.ok) {
            toast.success("Review hidden.");
            load();
          } else toast.error(r.message);
        }}
      />
    </DashboardLayout>
  );
}

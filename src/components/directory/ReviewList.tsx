import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common";
import type { Paginated, PublicReview } from "@/lib/directory/types";
import { listPublicReviewsFn } from "@/lib/directory/functions";
import { formatDate } from "@/lib/format";

import { Stars } from "./Stars";

/**
 * Server-paginated public reviews. Page 1 is rendered from the route loader;
 * "Load more" fetches the next page from the server (never the whole list).
 * Comments are rendered as plain text — React escapes everything, and there
 * is no dangerouslySetInnerHTML anywhere.
 */
export function ReviewList({
  target,
  targetId,
  initial,
}: {
  target: "doctor" | "hospital";
  targetId: string;
  initial: Paginated<PublicReview>;
}) {
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setItems(initial.items);
    setPage(initial.page);
  }, [initial]);

  async function loadMore() {
    setLoading(true);
    setError(false);
    try {
      const next = await listPublicReviewsFn({ data: { target, targetId, page: page + 1 } });
      setItems((prev) => [...prev, ...next.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setPage(next.page);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (initial.total === 0) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Reviews appear here after patients complete an appointment and share their experience."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex gap-4 p-5">
            <Avatar>
              <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                {r.reviewerName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-medium">{r.reviewerName}</p>
                <Stars value={r.rating} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(r.createdAt)}
                  {r.edited ? " · edited" : ""}
                </span>
              </div>
              {r.comment && (
                <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                  {r.comment}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {items.length < initial.total && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more reviews"}
          </Button>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              Couldn't load more reviews. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

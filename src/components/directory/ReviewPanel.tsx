import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import {
  createReviewFn,
  getAppointmentReviewFn,
  removeReviewFn,
  restoreReviewFn,
  updateReviewFn,
} from "@/lib/reviews/functions";
import type { AppointmentReviewState, MyReview } from "@/lib/reviews/queries.server";
import { REVIEW_COMMENT_MAX } from "@/lib/validation/directory";

import { StarInput, Stars } from "./Stars";

/**
 * Review controls on a patient's appointment page. Rendered only for
 * COMPLETED appointments. The browser sends just {appointmentId, rating,
 * comment}; the server derives the doctor/hospital and re-checks ownership
 * and status. Comment is plain text.
 */
export function ReviewPanel({ appointmentId }: { appointmentId: string }) {
  const [state, setState] = useState<AppointmentReviewState | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    getAppointmentReviewFn({ data: { appointmentId } })
      .then(setState)
      .catch(() => setState(null));
  }, [appointmentId]);
  useEffect(load, [load]);

  if (state === undefined) return null;
  if (state === null) return null;

  const review = state.review;

  async function act(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, ok: string) {
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(ok);
      setEditing(false);
      load();
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  if (state.canReview) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold">Leave a review</h3>
          <ReviewForm
            submitLabel="Submit review"
            onSubmit={(rating, comment) =>
              act(
                () => createReviewFn({ data: { appointmentId, rating, comment } }),
                "Thanks — your review is published.",
              )
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (!review) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h3 className="font-semibold">Your review</h3>
        {editing ? (
          <ReviewForm
            initialRating={review.rating}
            initialComment={review.comment ?? ""}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={(rating, comment) =>
              act(
                () => updateReviewFn({ data: { reviewId: review.id, rating, comment } }),
                "Review updated.",
              )
            }
          />
        ) : (
          <ExistingReview
            review={review}
            onEdit={() => setEditing(true)}
            onRemove={() =>
              confirm("Remove your review? It will no longer be shown publicly.") &&
              act(() => removeReviewFn({ data: { reviewId: review.id } }), "Review removed.")
            }
            onRestore={() =>
              act(() => restoreReviewFn({ data: { reviewId: review.id } }), "Review restored.")
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

export function ExistingReview({
  review,
  onEdit,
  onRemove,
  onRestore,
}: {
  review: MyReview;
  onEdit: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Stars value={review.rating} />
        <span className="text-xs text-muted-foreground">
          {formatDate(review.createdAt)}
          {review.editedAt ? " · edited" : ""}
        </span>
      </div>
      {review.comment && (
        <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
          {review.comment}
        </p>
      )}
      {review.status === "HIDDEN" && review.hiddenBy === "MODERATION" && (
        <p role="status" className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          This review was hidden by Medix moderation
          {review.hiddenReason ? `: ${review.hiddenReason}` : "."}
        </p>
      )}
      {review.status === "HIDDEN" && review.hiddenBy === "SELF" && (
        <p role="status" className="text-xs text-muted-foreground">
          You removed this review — it isn't shown publicly.
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {review.status === "PUBLISHED" && (
          <>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={onRemove}>
              Remove
            </Button>
          </>
        )}
        {review.status === "HIDDEN" && review.hiddenBy === "SELF" && (
          <Button variant="outline" size="sm" onClick={onRestore}>
            Restore review
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewForm({
  initialRating = 0,
  initialComment = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialRating?: number;
  initialComment?: string;
  submitLabel: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (rating < 1) {
      setError("Please choose a rating from 1 to 5.");
      return;
    }
    const trimmed = comment.trim();
    if (trimmed.length > 0 && trimmed.length < 10) {
      setError("Comments need at least 10 characters (or leave it empty).");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(rating, trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <StarInput value={rating} onChange={setRating} disabled={busy} />
      <div className="space-y-1">
        <Textarea
          value={comment}
          maxLength={REVIEW_COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience (optional, plain text)"
          rows={4}
          aria-label="Review comment"
          disabled={busy}
        />
        <p className="text-right text-xs text-muted-foreground">
          {comment.length}/{REVIEW_COMMENT_MAX}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

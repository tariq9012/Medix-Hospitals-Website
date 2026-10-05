import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation gate for sensitive admin mutations (approve/reject/suspend/
 * reactivate). Spells out exactly what is about to happen, and — when the
 * action requires a persisted reason — refuses to submit until one of
 * adequate length is provided. The server independently enforces the same
 * requirement; this is the UX half of that rule, not the security half.
 */
export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  requiresReason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  requiresReason?: boolean;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasonTooShort = Boolean(requiresReason) && reason.trim().length < 10;

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await onConfirm(requiresReason ? reason.trim() : undefined);
      setReason("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requiresReason && (
          <div className="space-y-2">
            <Label htmlFor="admin-reason">Reason (required, saved permanently)</Label>
            <Textarea
              id="admin-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the decision — this is stored in the verification history."
            />
            {reasonTooShort && reason.length > 0 && (
              <p className="text-xs text-destructive">Please write at least 10 characters.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isSubmitting || reasonTooShort}
          >
            {isSubmitting ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

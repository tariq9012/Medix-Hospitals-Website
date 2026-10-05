import { ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown in place of hospital data when the hospital's own verification
 * isn't APPROVED. The server enforces the same rule
 * (`requireOperationalHospital`) — this is the user-facing explanation, not
 * the security boundary.
 */
export function HospitalPendingNotice({
  status,
  reason,
}: {
  status: string;
  reason?: string | null;
}) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();

  return (
    <Card className="border-warning/40 bg-warning/10">
      <CardContent className="flex items-start gap-3 p-5">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Hospital verification is {label.toLowerCase()}</p>
          <p className="text-muted-foreground">
            Management features stay locked until a Medix admin approves your hospital. You can
            still sign in and review this page.
          </p>
          {reason && (
            <p className="mt-2 rounded-md bg-background/60 p-2 text-muted-foreground">
              <span className="font-medium">Reason on file:</span> {reason}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

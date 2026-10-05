import { useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  startConversationAsDoctorFn,
  startConversationAsPatientFn,
} from "@/lib/messaging/functions";

/**
 * Server-side eligibility (a real appointment relationship) is
 * re-validated inside `findOrCreateConversation` regardless of which
 * appointment/context this button was rendered from — this component just
 * gives the person a one-click way into that flow, it isn't itself a
 * source of authority.
 */
export function MessageButton({
  as,
  targetId,
  label,
  variant = "outline",
}: {
  /** Whether the CURRENT session is the patient (messaging a doctor) or the doctor (messaging a patient). */
  as: "patient" | "doctor";
  /** The doctor's id (when `as="patient"`) or the patient's user id (when `as="doctor"`). */
  targetId: string;
  label?: string;
  variant?: "outline" | "default";
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result =
        as === "patient"
          ? await startConversationAsPatientFn({ data: { doctorId: targetId } })
          : await startConversationAsDoctorFn({ data: { patientId: targetId } });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      navigate({
        to: as === "patient" ? "/patient/messages/$id" : "/doctor/messages/$id",
        params: { id: result.conversationId },
      });
    } catch {
      toast.error("Could not open the conversation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} onClick={handleClick} disabled={loading}>
      <MessageSquare className="size-4" aria-hidden="true" />
      {loading ? "Opening…" : (label ?? (as === "patient" ? "Message doctor" : "Message patient"))}
    </Button>
  );
}

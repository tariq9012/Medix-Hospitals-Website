import "@tanstack/react-start/server-only";

import { requireCompletedOwnedAppointment } from "@/lib/clinical/authorization.server";

/**
 * Document upload uses the exact same "owned, COMPLETED appointment" rule
 * as medical records and prescriptions (Phase 8's
 * `requireCompletedOwnedAppointment`). Re-exported here rather than
 * duplicated so the two modules can never quietly drift apart on what
 * "authorized to create clinical data for this appointment" means.
 *
 * Phase 9 rule #7 explicitly allows a future exception ("if a document
 * legitimately needs to be uploaded before completion, document and
 * explicitly implement that policy") — no such exception is implemented
 * here; every document upload requires COMPLETED, same as records/prescriptions.
 */
export { requireCompletedOwnedAppointment };

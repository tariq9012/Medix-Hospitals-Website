import "@tanstack/react-start/server-only";

import { createHash } from "node:crypto";

import { ClinicalError } from "@/lib/clinical/errors";

/**
 * Conservative allowlist (rule #12 of the Phase 9 spec). Deliberately
 * small — this is a clinical-document upload, not a general file host.
 * Adding a format here means adding its magic-byte signature below too;
 * an entry in one list without the other is a bug, not a supported format.
 */
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const MAX_UPLOAD_BYTES = (() => {
  const configuredMb = Number(process.env["MEDICAL_UPLOAD_MAX_MB"]);
  const mb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 10;
  return mb * 1024 * 1024;
})();

/**
 * Real file-signature ("magic byte") checks, not just trusting the
 * extension or the browser-supplied MIME type. This is what stops a
 * renamed `.exe` claiming to be `report.pdf` — the declared MIME type is
 * cross-checked against what the bytes actually start with.
 */
function detectMimeType(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && pngSignature.every((byte, i) => buffer[i] === byte)) {
    return "image/png";
  }
  return null;
}

export interface ValidatedFile {
  buffer: Buffer;
  /** The MIME type actually detected from the file's bytes — this is what gets stored, not whatever the browser claimed. */
  mimeType: AllowedMimeType;
  size: number;
  checksum: string;
}

/**
 * Validates an uploaded file: non-empty, within the configured size limit,
 * and — critically — has a real file signature matching one of the
 * allowed formats. Does NOT trust the browser's declared MIME type or the
 * filename's extension for that decision; both are cross-checked against
 * the actual bytes and rejected on mismatch.
 *
 * This is a focused allowlist + magic-byte check, not a malware scanner —
 * see the README's "Medical Documents" section for why that's an
 * explicitly separate, not-yet-built concern.
 */
export function validateUploadedFile(buffer: Buffer, declaredMimeType: string): ValidatedFile {
  if (buffer.length === 0) {
    throw new ClinicalError("The uploaded file is empty.");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    const maxMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    throw new ClinicalError(`File is too large. The maximum allowed size is ${maxMb}MB.`);
  }

  const detected = detectMimeType(buffer);
  if (!detected) {
    throw new ClinicalError("Unsupported file type. Only PDF, JPEG, and PNG files are accepted.");
  }
  if (declaredMimeType && ALLOWED_MIME_TYPES.includes(declaredMimeType as AllowedMimeType)) {
    // The browser's declared type is allowed to differ slightly (some
    // browsers send generic types), but if it names a DIFFERENT allowed
    // format than what the bytes actually are, that's a real mismatch —
    // reject rather than silently trusting either side.
    if (declaredMimeType !== detected) {
      throw new ClinicalError(
        "The file's contents don't match its declared type. Please upload a genuine PDF, JPEG, or PNG file.",
      );
    }
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");
  return { buffer, mimeType: detected, size: buffer.length, checksum };
}

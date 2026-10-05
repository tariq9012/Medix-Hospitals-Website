import { downloadMedicalDocumentFn } from "./functions";

/**
 * Fetches a document's bytes through the authenticated server function
 * (never a raw/guessable URL — see `downloadMedicalDocumentFn`'s doc
 * comment for why this is a server-function call rather than a static
 * link), decodes the base64 payload into a `Blob` client-side, and either
 * opens it in a new tab (`mode: "view"`) or triggers a save
 * (`mode: "download"`).
 */
export async function openMedicalDocument(
  documentId: string,
  mode: "view" | "download" = "view",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await downloadMedicalDocumentFn({ data: { documentId } });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const byteChars = atob(result.base64);
  const byteNumbers = new Array<number>(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: result.mimeType });
  const url = URL.createObjectURL(blob);

  if (mode === "view") {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Revoke once the browser has had a chance to act on the URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);

  return { ok: true };
}

import type { Message } from "@/db/schema";

/**
 * Merges the authoritative latest page from the server into what's already on
 * screen. Messages are keyed by id (so duplicate events / echo refreshes can
 * never render twice), the server's own DB ordering is preserved for the
 * latest page, and older pages the user already loaded are kept as-is.
 * Never re-sorts by client timestamps: two messages in the same millisecond
 * keep the order PostgreSQL returned.
 */
export function mergeLatestPage(prev: Message[], latest: Message[]): Message[] {
  const first = latest[0];
  const last = latest[latest.length - 1];
  if (!first || !last) return prev;
  const firstTime = new Date(first.createdAt).getTime();
  const lastTime = new Date(last.createdAt).getTime();
  const latestIds = new Set(latest.map((m) => m.id));
  const others = prev.filter((m) => !latestIds.has(m.id));
  // Older pages the user already loaded (before this page)...
  const older = others.filter((m) => new Date(m.createdAt).getTime() < firstTime);
  // ...and anything NEWER than this page's newest message. Messages are never
  // deleted, so a message we already hold that this page lacks can only come
  // from a fresher response that raced ahead of this (stale) one — keep it.
  const newer = others.filter((m) => new Date(m.createdAt).getTime() > lastTime);
  return [...older, ...latest, ...newer];
}

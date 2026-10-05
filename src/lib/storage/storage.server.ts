import "@tanstack/react-start/server-only";

import { LocalStorageDriver } from "./local.server";
import type { StorageDriver } from "./types";

/**
 * Single place that decides which storage backend is active. Everything
 * else in the app imports `storage` from here rather than reaching for
 * `LocalStorageDriver` directly, so swapping in an S3/R2-backed driver
 * later is a one-line change here — not a rewrite of clinical logic.
 *
 * There is no cloud driver in this phase (Phase 9 scope is local/private
 * filesystem storage only) — see the README's "Medical Documents" section
 * for what a production driver would need to add (its own class
 * implementing `StorageDriver`, wired in below).
 */
export const storage: StorageDriver = new LocalStorageDriver();

export type { StorageDriver, StoredFile } from "./types";

import "@tanstack/react-start/server-only";

import { LocalStorageDriver } from "./local.server";
import { R2StorageDriver } from "./r2.server";
import type { StorageDriver } from "./types";

function createStorage(): StorageDriver {
  const driver = process.env["STORAGE_DRIVER"]?.trim().toLowerCase();
  if (driver === "r2") return new R2StorageDriver();
  if (driver && driver !== "local") throw new Error(`Unsupported STORAGE_DRIVER: ${driver}.`);
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("STORAGE_DRIVER=r2 is required in production; local disk is ephemeral.");
  }
  return new LocalStorageDriver();
}

export const storage: StorageDriver = createStorage();
export type { StorageDriver, StoredFile } from "./types";

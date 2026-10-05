import "@tanstack/react-start/server-only";

/**
 * Storage abstraction so clinical business logic never talks to the
 * filesystem (or, later, S3/R2/etc.) directly. Swapping local disk for a
 * cloud object store means writing a new class that implements this
 * interface — nothing in `src/lib/documents/` should need to change.
 */
export interface StoredFile {
  /** Opaque key identifying the file within the storage backend. Never a raw filesystem path or public URL — never expose this to the client directly. */
  key: string;
  /** Size actually written, in bytes — recomputed from the stored file, not trusted from the caller. */
  size: number;
}

export interface StorageDriver {
  /**
   * Persists `data` under a NEW, randomly generated key (never derived from
   * the caller-supplied filename) and returns that key. Implementations
   * must reject/ignore any path-traversal attempt from a caller-supplied
   * hint and must not allow the result to escape the configured storage
   * root.
   */
  put(data: Buffer): Promise<StoredFile>;

  /** Reads back the bytes for a previously stored key. Throws if the key doesn't resolve to a file inside the storage root. */
  get(key: string): Promise<Buffer>;

  /** Best-effort delete, used only for cleaning up an orphaned file after a failed DB write (see `src/lib/documents/service.server.ts`). Never called as a user-facing "delete my document" feature in this phase. */
  delete(key: string): Promise<void>;
}

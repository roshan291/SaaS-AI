// Storage provider contract.
//
// All concrete implementations (local FS, S3, R2, GCS) must satisfy this
// interface so the calling code (image worker) never knows where the bytes
// actually live. Adding S3 later is a pure dependency-injection change.
//
// `key` is the path/object name (we generate `images/<uuid>.<ext>` upstream).
// `url` is the publicly fetchable URL the API will hand back to clients.

export interface PutResult {
    key: string;
    url: string;
}

export interface StorageProvider {
    /**
     * Persist `bytes` under `key` and return the public URL.
     *
     * Implementations should be idempotent: calling `put` twice with the same
     * key should overwrite (or no-op) without throwing. They MUST NOT allow
     * `..` path traversal.
     */
    put(
        key: string,
        bytes: Buffer,
        contentType: string
    ): Promise<PutResult>;

    /**
     * Resolve a key to its public URL without writing anything. Used by code
     * that already knows a key exists (e.g. retrieving an old asset).
     */
    urlFor(key: string): string;

    /**
     * Lightweight reachability check used by the API's readiness probe.
     * Implementations SHOULD complete in well under 5 seconds and MUST NOT
     * write any data. Returning `false` (not throwing) indicates the
     * dependency is degraded; throwing is reserved for misconfiguration.
     */
    ping(): Promise<boolean>;
}

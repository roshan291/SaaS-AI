// Public surface of the storage package.
//
// Cloudinary is the *only* backend. We removed the local-FS provider
// because it doesn't scale horizontally (separate API + worker pods
// don't share a disk), doesn't survive container restarts on ephemeral
// hosts, and forces every <img> request through our API origin.
//
// `getStorage()` returns a configured `CloudinaryStorageProvider`
// singleton. Credentials are validated on first call so misconfiguration
// surfaces at startup, not on the first image job.
export type { StorageProvider, PutResult } from "./storage-provider";
export { CloudinaryStorageProvider } from "./cloudinary-storage";

import { CloudinaryStorageProvider } from "./cloudinary-storage";
import type { StorageProvider } from "./storage-provider";

let instance: StorageProvider | undefined;

export function getStorage(): StorageProvider {
    if (!instance) {
        instance = new CloudinaryStorageProvider();
    }
    return instance;
}

/**
 * Test-only / startup-only hook to inject a custom provider (or reset the
 * cached singleton). Not exported for production use cases.
 */
export function __setStorageForTests(p: StorageProvider | undefined) {
    instance = p;
}

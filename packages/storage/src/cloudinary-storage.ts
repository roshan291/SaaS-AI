// Cloudinary-backed storage provider.
//
// This is the *only* storage backend. Cloudinary gives us a CDN, on-the-fly
// image transforms (format/resize), and zero ops; the previous local-FS
// provider was removed because it didn't survive container restarts and
// couldn't be shared between separately-deployed API and worker pods.
//
// Configuration (any one of the following sets works):
//
//   Option A — single env var (Cloudinary's recommended form):
//     CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
//
//   Option B — three separate vars (useful if your platform's secret
//   manager prefers them split):
//     CLOUDINARY_CLOUD_NAME=<cloud_name>
//     CLOUDINARY_API_KEY=<api_key>
//     CLOUDINARY_API_SECRET=<api_secret>
//
//   Optional:
//     CLOUDINARY_FOLDER=social-saas    (prefix prepended to every public_id;
//                                       useful to isolate dev/prod in one
//                                       Cloudinary account)
//
// The SDK auto-reads `CLOUDINARY_URL` on import, so Option A needs no code.
// Option B requires the explicit `cloudinary.config()` call below. We
// validate at construction time so a missing/empty credentials set fails
// fast at boot, not on the first image job.
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();
import type { PutResult, StorageProvider } from "./storage-provider";

export class CloudinaryStorageProvider implements StorageProvider {
    private readonly folder?: string;

    constructor() {
        const hasSplitVars = Boolean(
            process.env.CLOUDINARY_CLOUD_NAME &&
                process.env.CLOUDINARY_API_KEY &&
                process.env.CLOUDINARY_API_SECRET
        );
        const hasUrl = Boolean(process.env.CLOUDINARY_URL);

        if (!hasUrl && !hasSplitVars) {
            throw new Error(
                "Cloudinary storage is not configured. Set CLOUDINARY_URL " +
                    "(cloudinary://<key>:<secret>@<cloud>) or all three of " +
                    "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / " +
                    "CLOUDINARY_API_SECRET in your env."
            );
        }

        if (hasSplitVars) {
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET,
                secure: true
            });
        } else {
            // Even with Option A, force HTTPS URLs in the response.
            cloudinary.config({ secure: true });
        }

        this.folder = process.env.CLOUDINARY_FOLDER || undefined;
    }

    async put(
        key: string,
        bytes: Buffer,
        contentType: string
    ): Promise<PutResult> {
        // Cloudinary tracks file extensions separately from the public_id.
        // Strip the extension so the same upload can later be served as
        // .png/.webp/.avif via Cloudinary's `f_auto` transformation.
        const publicId = this.publicIdFor(key);
        const resourceType = this.resourceTypeFor(contentType);

        const result: UploadApiResponse = await new Promise(
            (resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        public_id: publicId,
                        resource_type: resourceType,
                        overwrite: true,
                        unique_filename: false,
                        // Tag every upload so they're easy to bulk-clean in
                        // dev / when changing folder layouts.
                        tags: ["social-saas", "ai-generated"]
                    },
                    (err, uploadResult) => {
                        if (err) return reject(err);
                        if (!uploadResult) {
                            return reject(
                                new Error("Cloudinary upload returned no result")
                            );
                        }
                        resolve(uploadResult);
                    }
                );
                stream.end(bytes);
            }
        );

        return {
            // Persist Cloudinary's *real* public_id (it may include our
            // folder prefix) so urlFor / deletes work later.
            key: result.public_id,
            url: result.secure_url
        };
    }

    urlFor(key: string): string {
        // `cloudinary.url` builds a CDN URL from a stored public_id. We do
        // not know the resource_type here; default to `image` (this matches
        // 100% of current callers — the image agent). When we add a video
        // pipeline we'll extend this with an options arg.
        return cloudinary.url(key, {
            secure: true,
            resource_type: "image"
        });
    }

    /**
     * Reachability check for /readyz. `cloudinary.api.ping()` issues a
     * lightweight authenticated GET against the Admin API; a successful
     * response confirms credentials + network path. Catches and converts
     * to `false` so the readiness probe never throws.
     */
    async ping(): Promise<boolean> {
        try {
            const result = await cloudinary.api.ping();
            return result?.status === "ok";
        } catch {
            return false;
        }
    }

    private publicIdFor(key: string): string {
        const withoutExt = key.replace(/\.[a-z0-9]+$/i, "");
        return this.folder
            ? `${this.folder.replace(/\/+$/, "")}/${withoutExt}`
            : withoutExt;
    }

    private resourceTypeFor(
        mimeType: string
    ): "image" | "video" | "raw" {
        if (mimeType.startsWith("image/")) return "image";
        if (mimeType.startsWith("video/")) return "video";
        return "raw";
    }
}

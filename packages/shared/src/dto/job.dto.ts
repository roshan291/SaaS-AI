// Public-facing job DTO. Strips fields that are internal to the platform:
//   - workspaceId  (tenant boundary; never echo back)
//   - queueJobId   (BullMQ internal id; would help an attacker scope attacks)
//   - __v          (Mongoose version key)
//
// `jobId` is exposed instead of `_id` so the field name is stable across
// implementations.
export interface PublicJob {
  jobId: string;
  type: string;
  status: "queued" | "processing" | "completed" | "failed";
  payload?: unknown;
  result?: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type RawJob = {
  _id?: { toString(): string } | string;
  type?: string;
  status?: string;
  payload?: unknown;
  result?: unknown;
  error?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  toJSON?: () => Record<string, unknown>;
};

function toIsoOrNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export function toPublicJob(job: RawJob | null | undefined): PublicJob | null {
  if (!job) return null;

  const raw =
    typeof job.toJSON === "function" ? job.toJSON() : (job as Record<string, unknown>);

  const id = raw._id ?? (job as { _id?: unknown })._id;
  const jobId =
    typeof id === "string"
      ? id
      : id && typeof (id as { toString: () => string }).toString === "function"
        ? (id as { toString: () => string }).toString()
        : "";

  return {
    jobId,
    type: (raw.type as string) ?? "",
    status:
      (raw.status as PublicJob["status"]) ??
      ("queued" as PublicJob["status"]),
    payload: raw.payload,
    result: raw.result,
    error: (raw.error as string | null | undefined) ?? null,
    startedAt: toIsoOrNull(raw.startedAt as Date | string | null | undefined),
    completedAt: toIsoOrNull(
      raw.completedAt as Date | string | null | undefined
    ),
    createdAt: raw.createdAt
      ? new Date(raw.createdAt as string | Date).toISOString()
      : undefined,
    updatedAt: raw.updatedAt
      ? new Date(raw.updatedAt as string | Date).toISOString()
      : undefined
  };
}

export function toPublicJobs(
  jobs: Array<RawJob | null | undefined>
): PublicJob[] {
  return jobs
    .map((j) => toPublicJob(j))
    .filter((j): j is PublicJob => j !== null);
}

import { JobRepository } from "@saas/db";
import { Errors } from "../lib/respond";

interface CreateJobInput {
    workspaceId: string;
    type: string;
    payload: unknown;
    // Optional caller-supplied key. Sparse compound index on
    // (workspaceId, idempotencyKey) enforces uniqueness when present.
    idempotencyKey?: string;
}

export class JobService {

    async createJob(data: CreateJobInput) {
        const doc: Record<string, unknown> = {
            workspaceId: data.workspaceId,
            type: data.type,
            payload: data.payload,
            status: "queued"
        };

        if (data.idempotencyKey) {
            doc.idempotencyKey = data.idempotencyKey;
        }

        return JobRepository.create(doc);
    }

    async findByIdempotency(
        workspaceId: string,
        idempotencyKey: string
    ) {
        return JobRepository.findByIdempotency(
            workspaceId,
            idempotencyKey
        );
    }

    async getJobs(workspaceId: string) {
        return JobRepository.findByWorkspace(workspaceId);
    }

    async updateJob(id: string, data: Record<string, unknown>) {
        return JobRepository.update(id, data);
    }

    async getJobById(id: string, workspaceId: string) {
        return JobRepository.findByIdAndWorkspace(id, workspaceId);
    }

    async getStats(workspaceId: string) {
        // Repository returns the shaped object already
        // (`{ queued, processing, completed, failed, total }`).
        return JobRepository.getStats(workspaceId);
    }

    async retryJob(id: string, workspaceId: string) {
        const job = await JobRepository.findByIdAndWorkspace(id, workspaceId);

        if (!job) {
            throw Errors.notFound("Job");
        }

        if (job.status === "completed") {
            throw Errors.conflict(
                "Completed jobs cannot be retried",
                "JOB_ALREADY_COMPLETED"
            );
        }

        if (job.status === "processing") {
            throw Errors.conflict(
                "Job is already processing",
                "JOB_ALREADY_PROCESSING"
            );
        }

        if (job.status !== "failed") {
            throw Errors.conflict(
                "Only failed jobs can be retried",
                "JOB_NOT_RETRYABLE"
            );
        }

        return JobRepository.resetForRetry(id);
    }
}

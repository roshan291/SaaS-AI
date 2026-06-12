import {
    JobRepository
} from "@saas/db";

export class JobService {

    async createJob(
        data: any
    ) {

        return JobRepository.create({
            workspaceId:
                data.workspaceId,

            type:
                data.type,

            payload:
                data.payload,

            status:
                "queued"
        });
    }

    async getJobs(
        workspaceId: string
    ) {

        return JobRepository.findByWorkspace(
            workspaceId
        );
    }

    async updateJob(
        id: string,
        data: any
    ) {

        return JobRepository.update(
            id,
            data
        );
    }
    async getJobById(
        id: string,
        workspaceId: string
    ) {

        return JobRepository.findByIdAndWorkspace(
            id,
            workspaceId
        );
    }
    async getStats(
        workspaceId: string
    ) {

        const stats =
            await JobRepository.getStats(
                workspaceId
            );

        const result = {
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            total: 0
        };

        stats.forEach(
            (item: any) => {

                result[
                    item._id as keyof typeof result
                ] = item.count;

                result.total += item.count;
            }
        );

        return result;
    }
    async retryJob(
        id: string,
        workspaceId: string
    ) {

        const job =
            await JobRepository.findByIdAndWorkspace(
                id,
                workspaceId
            );

        if (!job) {
            throw new Error(
                "Job not found"
            );
        }

        if (job.status === "completed") {
            throw new Error(
                "Completed jobs cannot be retried"
            );
        }

        if (job.status === "processing") {
            throw new Error(
                "Job is already processing"
            );
        }

        if (job.status !== "failed") {
            throw new Error(
                "Only failed jobs can be retried"
            );
        }

        return JobRepository.resetForRetry(
            id
        );
    }
}
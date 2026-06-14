import { BaseRepository } from "./base-repositories";
import { JobModel } from "../models/job";

class JobRepository
    extends BaseRepository<any> {

    constructor() {
        super(JobModel);
    }

    async findByWorkspace(
        workspaceId: string
    ) {

        return this.model
            .find({ workspaceId })
            .sort({ createdAt: -1 })
            .limit(200);
    }

    async findByQueueJobId(
        queueJobId: string
    ) {

        return this.model.findOne({
            queueJobId
        });
    }

    async updateStatus(
        id: string,
        status: string,
        data: any = {}
    ) {

        return this.model.findByIdAndUpdate(
            id,
            {
                status,
                ...data
            },
            {
                new: true
            }
        );
    }
    async findByIdAndWorkspace(
        id: string,
        workspaceId: string
    ) {
        return this.model.findOne({
            _id: id,
            workspaceId
        });
    }

    async findByIdempotency(
        workspaceId: string,
        idempotencyKey: string
    ) {
        return this.model.findOne({
            workspaceId,
            idempotencyKey
        });
    }
    // Returns counts shaped for the /jobs/stats endpoint:
    // `{ queued, processing, completed, failed, total }`.
    async getStats(
        workspaceId: string
    ) {
        const rows = await this.model.aggregate([
            { $match: { workspaceId } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        const stats: Record<string, number> = {
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            total: 0
        };

        for (const row of rows as Array<{ _id: string; count: number }>) {
            stats[row._id] = row.count;
            stats.total += row.count;
        }

        return stats;
    }
    async resetForRetry(
        id: string
    ) {

        return this.model.findByIdAndUpdate(
            id,
            {
                status: "queued",
                error: null,
                startedAt: null,
                completedAt: null,
                result: null
            },
            {
                new: true
            }
        );
    }

    // Mark jobs as failed when they have been stuck in `processing` longer
    // than `maxRuntimeMs`. Used by the worker's stalled-job watchdog so
    // crashed pods do not leave rows in limbo.
    async markStalled(maxRuntimeMs: number) {
        const cutoff = new Date(Date.now() - maxRuntimeMs);
        return this.model.updateMany(
            {
                status: "processing",
                startedAt: { $lt: cutoff }
            },
            {
                $set: {
                    status: "failed",
                    error: "Job stalled — worker did not complete in time",
                    completedAt: new Date()
                }
            }
        );
    }
}

export default new JobRepository();
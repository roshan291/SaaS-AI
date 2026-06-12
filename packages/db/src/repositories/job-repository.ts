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

        return this.model.find({
            workspaceId
        });
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
    async getStats(
        workspaceId: string
    ) {

        const stats =
            await this.model.aggregate([
                {
                    $match: {
                        workspaceId
                    }
                },
                {
                    $group: {
                        _id: "$status",
                        count: {
                            $sum: 1
                        }
                    }
                }
            ]);

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
}

export default new JobRepository();
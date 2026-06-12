import { Router } from "express";
import { WorkspaceService } from "../services/workspace-service";
import { CreateWorkspaceSchema } from "@saas/shared";

const router = Router();

const service = new WorkspaceService();

router.post("/", async (req, res) => {
  try {

    const data = CreateWorkspaceSchema.parse(req.body);
    const workspace = await service.createWorkspace(data);

    res.status(201).json(workspace);

  } catch (error: any) {

    res.status(400).json({
      message: error.message
    });
  }
});

router.get("/", async (_, res) => {

  const workspaces = await service.getWorkspaces();

  res.json(workspaces);
});
// get method => because users shouldn't see all workspaces.
// Keep it for now.
export default router;
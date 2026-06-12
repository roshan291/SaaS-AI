import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectMongo } from "@saas/db";

import postRoutes from "./routes/post.routes";
import workspaceRoutes from "./routes/workspace.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./auth/auth-routes";
import aiGenerateRoutes from "../v1/ai/generate";
import jobRoutes from "../v1/job";

import { errorHandler } from "./middlewares/error-handler";
import hashtagRoutes from "./routes/hashtag-routes";
import aiImageGenerateRoutes from "./routes/image-routes";
import videoRoutes from "./routes/video-routes";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (_, res) => {
  res.send("API Running");
});

connectMongo();

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/posts", postRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workspaces", workspaceRoutes);
app.use("/api/v1/ai", aiGenerateRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/hashtags", hashtagRoutes);
app.use("/api/v1/images", aiImageGenerateRoutes);
app.use("/api/v1/videos", videoRoutes);

//Error Handler
app.use(errorHandler);

app.listen(4000, () => {
  console.log("API Started");
});
import dotenv from "dotenv";
dotenv.config();

import { connectMongo } from "@saas/db";
import mongoose from "mongoose";

// Usage: npx tsx apps/api/scripts/delete-workspace.ts <slug>
// Deletes the workspace with the given slug AND every user that belonged to it.
async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: tsx apps/api/scripts/delete-workspace.ts <slug>");
    process.exit(1);
  }

  await connectMongo();
  const workspaces = mongoose.connection.collection("workspaces");
  const users = mongoose.connection.collection("users");

  const ws = await workspaces.findOne({ slug });
  if (!ws) {
    console.log(`No workspace found with slug='${slug}'.`);
    await mongoose.disconnect();
    return;
  }

  const wsId = ws._id.toString();
  const userResult = await users.deleteMany({ workspaceId: wsId });
  const wsResult = await workspaces.deleteOne({ _id: ws._id });

  console.log({
    deletedWorkspace: wsResult.deletedCount,
    deletedUsers: userResult.deletedCount,
    workspaceId: wsId,
    slug
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

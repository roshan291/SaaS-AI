import dotenv from "dotenv";
dotenv.config();

import { connectMongo } from "@saas/db";
import mongoose from "mongoose";

async function main() {
  await connectMongo();
  const workspaces = await mongoose.connection
    .collection("workspaces")
    .find({}, { projection: { slug: 1, name: 1, ownerId: 1, createdAt: 1 } })
    .toArray();

  const users = await mongoose.connection
    .collection("users")
    .find({}, { projection: { email: 1, role: 1, workspaceId: 1 } })
    .toArray();

  console.log("--- workspaces ---");
  console.table(workspaces);
  console.log("--- users ---");
  console.table(users);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

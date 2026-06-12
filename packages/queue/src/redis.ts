import dotenv from "dotenv";
dotenv.config();

// import IORedis from "ioredis";
import { URL } from "url";

// export const redis =
//   new IORedis(
//     process.env.REDIS_URL!,
//     {
//       maxRetriesPerRequest: null
//     }
//   );

 
if (!process.env.REDIS_URL) {
  throw new Error(
    "REDIS_URL is not set. Add it to the .env file of the process importing @saas/queue."
  );
}

const redisUrl = new URL(process.env.REDIS_URL);

export const redisConfig = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  username: decodeURIComponent(redisUrl.username),
  password: decodeURIComponent(redisUrl.password),
  // Upstash requires TLS
  tls: {},
  // Required by BullMQ for blocking commands used by Worker
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};
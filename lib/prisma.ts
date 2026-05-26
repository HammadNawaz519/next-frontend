import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function getPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    console.error("❌ CRITICAL ERROR: DATABASE_URL is missing!");
  }
  return new PrismaClient({
    log: ["warn", "error"],
  });
}

export const prisma = global.__prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

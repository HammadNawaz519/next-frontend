import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function getPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // If DATABASE_URL is missing (e.g. during build), return a default client.
    // It will only fail if a query is actually executed.
    return new PrismaClient();
  }
  // PrismaNeon takes a PoolConfig (not a Pool instance)
  const adapter = new PrismaNeon({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = global.__prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

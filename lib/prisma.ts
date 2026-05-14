import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function getPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";
  
  // In Prisma 7, we must provide an adapter if the schema doesn't have a URL.
  // Note: Your version of PrismaNeon expects a PoolConfig object.
  const adapter = new PrismaNeon({ connectionString: url });
  return new PrismaClient({ 
    adapter,
    log: ["query", "info", "warn", "error"] 
  });
}

export const prisma = global.__prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

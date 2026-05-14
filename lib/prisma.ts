import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function getPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";
  
  // In Prisma 7, we must provide an adapter or accelerateUrl if the schema doesn't have a URL.
  // We use the Neon adapter for both the real connection and the dummy fallback.
  const adapter = new PrismaNeon({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = global.__prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ CRITICAL ERROR: DATABASE_URL is missing!");
  }

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    // Keep at least 1 connection alive at all times — eliminates cold-start delay
    min: 1,
    max: 5,
    // Keep idle connections alive for 10 minutes
    idleTimeoutMillis: 600_000,
    // Fail fast on unreachable DB
    connectionTimeoutMillis: 8_000,
    // Send a keepalive packet every 30 s so Aiven doesn't drop the connection
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
  });
}

function getPrismaClient(): PrismaClient {
  const pool = global.__pgPool ?? createPool();
  global.__pgPool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });
}

// Singleton: reuse the same client (and pool) across hot-reloads in dev
export const prisma = global.__prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

// ── Pre-warm: open the connection immediately so the first sign-in is fast ──
// Run as a fire-and-forget — never blocks module load
if (typeof global.__pgPool !== "undefined") {
  global.__pgPool.query("SELECT 1").catch(() => {
    // Silently ignore — this is just a warm-up ping
  });
}

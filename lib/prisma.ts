import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Disable Node TLS cert verification for self-signed DB certificates (Aiven Cloud internal CA)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getConnectionString(): string {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ CRITICAL ERROR: DATABASE_URL environment variable is not set!");
    throw new Error("DATABASE_URL is not configured. Set it in Vercel Environment Variables.");
  }

  // Convert sslmode=require / verify-full -> sslmode=no-verify to accept self-signed certs
  if (connectionString.includes("sslmode=require")) {
    connectionString = connectionString.replace("sslmode=require", "sslmode=no-verify");
  } else if (connectionString.includes("sslmode=verify-full")) {
    connectionString = connectionString.replace("sslmode=verify-full", "sslmode=no-verify");
  } else if (!connectionString.includes("sslmode=")) {
    connectionString += (connectionString.includes("?") ? "&" : "?") + "sslmode=no-verify";
  }

  return connectionString;
}

function createPool(): Pool {
  const connectionString = getConnectionString();

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Allow self-signed certs (Aiven uses internal CA)
    min: 1,
    max: 5,
    idleTimeoutMillis: 600_000,        // keep idle connections alive 10 min
    connectionTimeoutMillis: 8_000,    // fail fast if unreachable
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
  });

  return pool;
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

// Singleton: reuse across hot-reloads in dev AND across invocations in production
export const prisma = global.__prisma ?? getPrismaClient();

// Always save to global — production lambda containers reuse process globals too
global.__prisma = prisma;

// ── Pre-warm: fire-and-forget ping so first real request is fast ──
if (global.__pgPool) {
  global.__pgPool.query("SELECT 1").catch(() => {
    // Silently ignore — warm-up failure is non-fatal
  });
}

/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts — before any requests are handled.
 * We use it to pre-warm the Prisma/PostgreSQL connection so the first
 * sign-in is fast instead of paying the ~10s Aiven cold-start penalty.
 */
export async function register() {
  // Only run on the Node.js server (not in the edge runtime or client)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$queryRaw`SELECT 1`;
      console.log("✅ [DB_WARMUP] PostgreSQL connection pre-warmed.");
    } catch (err) {
      // Don't crash the server if the DB is temporarily unreachable
      console.warn("⚠️ [DB_WARMUP] Pre-warm failed (will retry on first request):", err);
    }
  }
}

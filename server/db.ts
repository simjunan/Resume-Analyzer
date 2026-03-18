import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Only create a real pool when DATABASE_URL is configured.
// A missing URL must NOT crash the module — resume analysis works without a
// database; only anonymised analytics storage is affected.
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    })
  : null;

if (pool) {
  // pg.Pool emits 'error' when a background client hits an unexpected error.
  // Without a listener Node.js treats it as an uncaught exception and crashes
  // the process — causing FUNCTION_INVOCATION_FAILED on Vercel.
  pool.on("error", (err) => {
    console.error("pg pool error (non-fatal):", err.message);
  });
} else {
  console.warn(
    "DATABASE_URL is not set. Database operations are disabled. " +
    "Resume analysis will still work; only anonymised analytics storage is affected.",
  );
}

export const db = pool ? drizzle(pool, { schema }) : null;

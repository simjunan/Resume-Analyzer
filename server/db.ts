import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. Database operations will fail at runtime. " +
    "Resume analysis will still work; only anonymised analytics storage is affected.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost/placeholder",
});

// pg.Pool emits 'error' on the pool object when a client encounters an
// unexpected error (e.g. the DB is unreachable or DATABASE_URL is a
// placeholder). Without this listener Node.js treats it as an uncaught
// exception and crashes the process — causing FUNCTION_INVOCATION_FAILED
// on Vercel. Log it instead so the rest of the request can still complete.
pool.on("error", (err) => {
  console.error("pg pool error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

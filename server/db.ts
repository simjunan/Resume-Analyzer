import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Log a warning rather than throwing — a missing DATABASE_URL would
  // crash the module at import time, causing FUNCTION_INVOCATION_FAILED
  // for every request even though the core analysis flow doesn't need a DB.
  console.warn(
    "DATABASE_URL is not set. Database operations will fail at runtime. " +
    "Resume analysis will still work; only anonymised analytics storage is affected.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost/placeholder",
});
export const db = drizzle(pool, { schema });

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 10 });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
export { schema };

export async function runMigrations() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/db or dist/db → ../../drizzle
  const folder = path.resolve(here, "../../drizzle");
  await migrate(db, { migrationsFolder: folder });
}

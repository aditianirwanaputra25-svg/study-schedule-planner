import pg from "pg";
import { env } from "../config/env.js";

const { Pool, types } = pg;

types.setTypeParser(1082, (value) => value);
types.setTypeParser(1083, (value) => value);
types.setTypeParser(1114, (value) => value);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  options: "-c timezone=Asia/Jakarta",
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
  ssl: env.databaseSsl ? { rejectUnauthorized: true } : false,
});

pool.on("error", (error: Error) => {
  console.error("Kesalahan koneksi PostgreSQL idle:", error.message);
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config/env.js";
import { pool } from "./pool.js";

if (env.NODE_ENV === "production") {
  throw new Error("db:reset dilarang berjalan saat NODE_ENV=production");
}

try {
  const sql = await readFile(join(process.cwd(), "db", "reset.sql"), "utf8");
  await pool.query(sql);
  console.log("Database lokal/test telah direset.");
} finally {
  await pool.end();
}

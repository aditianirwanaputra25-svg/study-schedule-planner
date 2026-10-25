import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "./pool.js";

const migrationsDir = join(process.cwd(), "db", "migrations");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const filename of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename],
      );
      if (applied.rowCount === 0) {
        const sql = await readFile(join(migrationsDir, filename), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      }
      await client.query("COMMIT");
      console.log(`Migrasi diperiksa: ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error("Migrasi database gagal:", error instanceof Error ? error.message : "kesalahan tidak diketahui");
  process.exitCode = 1;
} finally {
  await pool.end();
}

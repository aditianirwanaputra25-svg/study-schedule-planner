import type { PoolClient } from "pg";
import { HttpError } from "../utils/errors.js";

export async function ensureMahasiswa(
  client: Pick<PoolClient, "query">,
  mahasiswaId: number,
): Promise<void> {
  const result = await client.query("SELECT 1 FROM mahasiswa WHERE id = $1", [mahasiswaId]);
  if (result.rowCount === 0) throw new HttpError(404, "Mahasiswa tidak ditemukan");
}

export async function ensureMataKuliah(
  client: Pick<PoolClient, "query">,
  mahasiswaId: number,
  mataKuliahId: number | null | undefined,
): Promise<void> {
  if (mataKuliahId == null) return;
  const result = await client.query(
    "SELECT 1 FROM mata_kuliah WHERE id = $1 AND mahasiswa_id = $2",
    [mataKuliahId, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(400, "Mata kuliah tidak ditemukan untuk mahasiswa ini");
}

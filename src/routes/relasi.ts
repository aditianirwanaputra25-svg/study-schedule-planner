import { Router } from "express";
import { pool } from "../db/pool.js";
import { HttpError, asyncHandler } from "../utils/errors.js";
import { ensureMahasiswa } from "../services/common.js";
import { linkSchema } from "../utils/schemas.js";
import { parseId } from "../utils/validation.js";

export const relasiRouter = Router({ mergeParams: true });

relasiRouter.get("/:tugasId/jadwal", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const tugasId = parseId(req.params.tugasId, "tugasId");
  await ensureMahasiswa(pool, mahasiswaId);
  const task = await pool.query(
    "SELECT 1 FROM tugas WHERE id = $1 AND mahasiswa_id = $2",
    [tugasId, mahasiswaId],
  );
  if (task.rowCount === 0) throw new HttpError(404, "Tugas tidak ditemukan");
  const result = await pool.query(
    `SELECT j.id, j.topik, j.tanggal::text, j.waktu_mulai::text,
            j.waktu_selesai::text, j.status
     FROM tugas_jadwal tj JOIN jadwal_belajar j ON j.id = tj.jadwal_id
     WHERE tj.tugas_id = $1 AND j.mahasiswa_id = $2
     ORDER BY j.tanggal, j.waktu_mulai`,
    [tugasId, mahasiswaId],
  );
  res.json({ data: result.rows, meta: { total: result.rowCount } });
}));

relasiRouter.post("/:tugasId/jadwal", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const tugasId = parseId(req.params.tugasId, "tugasId");
  const { jadwal_id: jadwalId } = linkSchema.parse(req.body);
  await ensureMahasiswa(pool, mahasiswaId);
  const validPair = await pool.query(
    `SELECT t.id FROM tugas t
     JOIN jadwal_belajar j ON j.mahasiswa_id = t.mahasiswa_id
     WHERE t.id = $1 AND j.id = $2 AND t.mahasiswa_id = $3`,
    [tugasId, jadwalId, mahasiswaId],
  );
  if (validPair.rowCount === 0) throw new HttpError(404, "Tugas atau jadwal tidak ditemukan untuk mahasiswa ini");
  const result = await pool.query(
    `INSERT INTO tugas_jadwal (tugas_id, jadwal_id) VALUES ($1, $2)
     RETURNING tugas_id, jadwal_id`,
    [tugasId, jadwalId],
  );
  res.status(201).json({ message: "Jadwal berhasil dihubungkan ke tugas", data: result.rows[0] });
}));

relasiRouter.delete("/:tugasId/jadwal/:jadwalId", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const tugasId = parseId(req.params.tugasId, "tugasId");
  const jadwalId = parseId(req.params.jadwalId, "jadwalId");
  const result = await pool.query(
    `DELETE FROM tugas_jadwal tj
     USING tugas t, jadwal_belajar j
     WHERE tj.tugas_id = t.id AND tj.jadwal_id = j.id
       AND tj.tugas_id = $1 AND tj.jadwal_id = $2
       AND t.mahasiswa_id = $3 AND j.mahasiswa_id = $3
     RETURNING tj.tugas_id, tj.jadwal_id`,
    [tugasId, jadwalId, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Relasi tugas dan jadwal tidak ditemukan");
  res.json({ message: "Relasi tugas dan jadwal berhasil dihapus", data: result.rows[0] });
}));

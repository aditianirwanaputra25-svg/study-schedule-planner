import { Router } from "express";
import { pool } from "../db/pool.js";
import { HttpError, asyncHandler } from "../utils/errors.js";
import { ensureMahasiswa } from "../services/common.js";
import { mataKuliahSchema } from "../utils/schemas.js";
import { parseId } from "../utils/validation.js";

export const mataKuliahRouter = Router({ mergeParams: true });

mataKuliahRouter.get("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  await ensureMahasiswa(pool, mahasiswaId);
  const result = await pool.query(
    "SELECT id, mahasiswa_id, kode, nama FROM mata_kuliah WHERE mahasiswa_id = $1 ORDER BY kode",
    [mahasiswaId],
  );
  res.json({ data: result.rows, meta: { total: result.rowCount } });
}));

mataKuliahRouter.post("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const input = mataKuliahSchema.parse(req.body);
  await ensureMahasiswa(pool, mahasiswaId);
  const result = await pool.query(
    `INSERT INTO mata_kuliah (mahasiswa_id, kode, nama)
     VALUES ($1, $2, $3)
     RETURNING id, mahasiswa_id, kode, nama`,
    [mahasiswaId, input.kode, input.nama],
  );
  res.status(201).json({ message: "Mata kuliah berhasil ditambahkan", data: result.rows[0] });
}));

mataKuliahRouter.get("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const result = await pool.query(
    `SELECT id, mahasiswa_id, kode, nama FROM mata_kuliah
     WHERE id = $1 AND mahasiswa_id = $2`,
    [id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Mata kuliah tidak ditemukan");
  res.json({ message: "Data mata kuliah ditemukan", data: result.rows[0] });
}));

mataKuliahRouter.put("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const input = mataKuliahSchema.parse(req.body);
  const result = await pool.query(
    `UPDATE mata_kuliah SET kode = $1, nama = $2
     WHERE id = $3 AND mahasiswa_id = $4
     RETURNING id, mahasiswa_id, kode, nama`,
    [input.kode, input.nama, id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Mata kuliah tidak ditemukan");
  res.json({ message: "Mata kuliah berhasil diperbarui", data: result.rows[0] });
}));

mataKuliahRouter.delete("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const result = await pool.query(
    "DELETE FROM mata_kuliah WHERE id = $1 AND mahasiswa_id = $2 RETURNING id",
    [id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Mata kuliah tidak ditemukan");
  res.json({ message: "Mata kuliah berhasil dihapus", data: result.rows[0] });
}));

import { Router } from "express";
import { pool } from "../db/pool.js";
import { HttpError, asyncHandler } from "../utils/errors.js";
import { parseId } from "../utils/validation.js";
import { mahasiswaCreateSchema, mahasiswaUpdateSchema } from "../utils/schemas.js";

export const mahasiswaRouter = Router();

mahasiswaRouter.get("/", asyncHandler(async (_req, res) => {
  const result = await pool.query(
    "SELECT id, nim, nama, email, created_at FROM mahasiswa ORDER BY id",
  );
  res.json({ data: result.rows, meta: { total: result.rowCount } });
}));

mahasiswaRouter.post("/", asyncHandler(async (req, res) => {
  const input = mahasiswaCreateSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO mahasiswa (nim, nama, email)
     VALUES ($1, $2, $3)
     RETURNING id, nim, nama, email, created_at`,
    [input.nim, input.nama, input.email ?? null],
  );
  res.status(201).json({ message: "Mahasiswa berhasil ditambahkan", data: result.rows[0] });
}));

mahasiswaRouter.get("/:mahasiswaId", asyncHandler(async (req, res) => {
  const id = parseId(req.params.mahasiswaId, "mahasiswaId");
  const result = await pool.query(
    "SELECT id, nim, nama, email, created_at FROM mahasiswa WHERE id = $1",
    [id],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Mahasiswa tidak ditemukan");
  res.json({ message: "Data mahasiswa ditemukan", data: result.rows[0] });
}));

mahasiswaRouter.put("/:mahasiswaId", asyncHandler(async (req, res) => {
  const id = parseId(req.params.mahasiswaId, "mahasiswaId");
  const input = mahasiswaUpdateSchema.parse(req.body);
  const result = await pool.query(
    `UPDATE mahasiswa SET nim = $1, nama = $2, email = $3
     WHERE id = $4
     RETURNING id, nim, nama, email, created_at`,
    [input.nim, input.nama, input.email ?? null, id],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Mahasiswa tidak ditemukan");
  res.json({ message: "Mahasiswa berhasil diperbarui", data: result.rows[0] });
}));

mahasiswaRouter.delete("/:mahasiswaId", asyncHandler(async (req, res) => {
  const id = parseId(req.params.mahasiswaId, "mahasiswaId");
  const result = await pool.query("DELETE FROM mahasiswa WHERE id = $1 RETURNING id", [id]);
  if (result.rowCount === 0) throw new HttpError(404, "Mahasiswa tidak ditemukan");
  res.json({ message: "Mahasiswa berhasil dihapus beserta seluruh datanya", data: result.rows[0] });
}));

import { Router } from "express";
import { pool } from "../db/pool.js";
import { HttpError, asyncHandler } from "../utils/errors.js";
import { ensureMahasiswa, ensureMataKuliah } from "../services/common.js";
import {
  mendekatiQuerySchema,
  statusUpdateSchema,
  tugasQuerySchema,
  tugasSchema,
} from "../utils/schemas.js";
import { normalizeDeadline, parseId } from "../utils/validation.js";

export const tugasRouter = Router({ mergeParams: true });

tugasRouter.get("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const query = tugasQuerySchema.parse(req.query);
  await ensureMahasiswa(pool, mahasiswaId);
  const values: Array<string | number> = [mahasiswaId];
  const filters = ["t.mahasiswa_id = $1"];
  if (query.status) {
    values.push(query.status);
    filters.push(`t.status = $${values.length}`);
  }
  if (query.mata_kuliah_id) {
    values.push(query.mata_kuliah_id);
    filters.push(`t.mata_kuliah_id = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT t.id, t.mahasiswa_id, t.mata_kuliah_id, t.nama_tugas,
            t.deskripsi, to_char(t.deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS deadline,
            t.status, mk.kode AS kode_mata_kuliah, mk.nama AS nama_mata_kuliah
     FROM tugas t LEFT JOIN mata_kuliah mk ON mk.id = t.mata_kuliah_id
     WHERE ${filters.join(" AND ")}
     ORDER BY t.deadline ASC`,
    values,
  );
  res.json({ data: result.rows, meta: { total: result.rowCount } });
}));

tugasRouter.get("/mendekati-deadline", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const { hari } = mendekatiQuerySchema.parse(req.query);
  await ensureMahasiswa(pool, mahasiswaId);
  const result = await pool.query(
    `SELECT id, nama_tugas, to_char(deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS deadline,
            status, mata_kuliah_id
     FROM tugas
     WHERE mahasiswa_id = $1 AND status = 'belum selesai'
       AND deadline <= (NOW() AT TIME ZONE 'Asia/Jakarta') + ($2::int * INTERVAL '1 day')
     ORDER BY deadline`,
    [mahasiswaId, hari],
  );
  const now = await pool.query<{ sekarang: string }>(
    `SELECT to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS') AS sekarang`,
  );
  const overdue: typeof result.rows = [];
  const near: typeof result.rows = [];
  for (const task of result.rows) {
    const deadline = String(task.deadline);
    if (deadline < now.rows[0]!.sekarang) overdue.push(task);
    else near.push(task);
  }
  res.json({
    data: { terlambat: overdue, mendekati: near },
    meta: { hari, sekarang: now.rows[0]!.sekarang },
  });
}));

tugasRouter.post("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const input = tugasSchema.parse(req.body);
  await ensureMahasiswa(pool, mahasiswaId);
  await ensureMataKuliah(pool, mahasiswaId, input.mata_kuliah_id);
  const result = await pool.query(
    `INSERT INTO tugas (mahasiswa_id, mata_kuliah_id, nama_tugas, deskripsi, deadline)
     VALUES ($1, $2, $3, $4, $5::timestamp)
     RETURNING id, mahasiswa_id, mata_kuliah_id, nama_tugas, deskripsi,
               to_char(deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS deadline, status`,
    [
      mahasiswaId,
      input.mata_kuliah_id ?? null,
      input.nama_tugas,
      input.deskripsi ?? null,
      normalizeDeadline(input.deadline),
    ],
  );
  res.status(201).json({ message: "Tugas berhasil ditambahkan", data: result.rows[0] });
}));

tugasRouter.get("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const task = await pool.query(
    `SELECT t.id, t.mahasiswa_id, t.mata_kuliah_id, t.nama_tugas, t.deskripsi,
            to_char(t.deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS deadline, t.status,
            mk.kode AS kode_mata_kuliah, mk.nama AS nama_mata_kuliah
     FROM tugas t LEFT JOIN mata_kuliah mk ON mk.id = t.mata_kuliah_id
     WHERE t.id = $1 AND t.mahasiswa_id = $2`,
    [id, mahasiswaId],
  );
  if (task.rowCount === 0) throw new HttpError(404, "Tugas tidak ditemukan");
  const schedules = await pool.query(
    `SELECT j.id, j.topik, j.tanggal::text, j.waktu_mulai::text,
            j.waktu_selesai::text, j.status
     FROM tugas_jadwal tj JOIN jadwal_belajar j ON j.id = tj.jadwal_id
     WHERE tj.tugas_id = $1 AND j.mahasiswa_id = $2
     ORDER BY j.tanggal, j.waktu_mulai`,
    [id, mahasiswaId],
  );
  res.json({ message: "Data tugas ditemukan", data: { ...task.rows[0], jadwal: schedules.rows } });
}));

tugasRouter.put("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const input = tugasSchema.parse(req.body);
  await ensureMataKuliah(pool, mahasiswaId, input.mata_kuliah_id);
  const result = await pool.query(
    `UPDATE tugas
     SET nama_tugas = $1, deadline = $2::timestamp, mata_kuliah_id = $3, deskripsi = $4
     WHERE id = $5 AND mahasiswa_id = $6
     RETURNING id, mahasiswa_id, mata_kuliah_id, nama_tugas, deskripsi,
               to_char(deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS deadline, status`,
    [
      input.nama_tugas,
      normalizeDeadline(input.deadline),
      input.mata_kuliah_id ?? null,
      input.deskripsi ?? null,
      id,
      mahasiswaId,
    ],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Tugas tidak ditemukan");
  res.json({ message: "Tugas berhasil diperbarui", data: result.rows[0] });
}));

tugasRouter.delete("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const result = await pool.query(
    "DELETE FROM tugas WHERE id = $1 AND mahasiswa_id = $2 RETURNING id",
    [id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Tugas tidak ditemukan");
  res.json({ message: "Tugas berhasil dihapus", data: result.rows[0] });
}));

tugasRouter.patch("/:id/status", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const { status } = statusUpdateSchema.parse(req.body);
  const result = await pool.query(
    `UPDATE tugas SET status = $1
     WHERE id = $2 AND mahasiswa_id = $3
     RETURNING id, mahasiswa_id, status`,
    [status, id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Tugas tidak ditemukan");
  res.json({ message: "Status tugas berhasil diperbarui", data: result.rows[0] });
}));

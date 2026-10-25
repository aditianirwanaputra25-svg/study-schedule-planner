import { Router } from "express";
import { pool } from "../db/pool.js";
import { inTransaction } from "../db/transaction.js";
import { HttpError, asyncHandler } from "../utils/errors.js";
import { ensureMahasiswa, ensureMataKuliah } from "../services/common.js";
import {
  bentrokQuerySchema,
  jadwalQuerySchema,
  jadwalSchema,
  statusUpdateSchema,
} from "../utils/schemas.js";
import { normalizeTime, parseId } from "../utils/validation.js";
import { overlaps } from "../utils/overlap.js";
import type { PoolClient } from "pg";

export const jadwalRouter = Router({ mergeParams: true });

type ScheduleRow = {
  id: number;
  mahasiswa_id: number;
  mata_kuliah_id: number | null;
  topik: string;
  tanggal: string;
  waktu_mulai: string;
  waktu_selesai: string;
  status: string;
  kode_mata_kuliah?: string | null;
  nama_mata_kuliah?: string | null;
};

async function findConflicts(
  mahasiswaId: number,
  input: { tanggal: string; waktu_mulai: string; waktu_selesai: string },
  excludeId?: number,
  client: Pick<PoolClient, "query"> = pool,
): Promise<ScheduleRow[]> {
  const result = await client.query<ScheduleRow>(
    `SELECT id, mahasiswa_id, mata_kuliah_id, topik, tanggal::text,
            waktu_mulai::text, waktu_selesai::text, status
     FROM jadwal_belajar
     WHERE mahasiswa_id = $1 AND tanggal = $2::date
       AND ($3::int IS NULL OR id <> $3)
     ORDER BY waktu_mulai`,
    [mahasiswaId, input.tanggal, excludeId ?? null],
  );
  return result.rows.filter((schedule) => overlaps(input, schedule));
}

function ensureNoConflict(conflicts: ScheduleRow[]): void {
  if (conflicts.length > 0) {
    throw new HttpError(409, "Jadwal bentrok dengan jadwal lain", conflicts);
  }
}

jadwalRouter.get("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const query = jadwalQuerySchema.parse(req.query);
  await ensureMahasiswa(pool, mahasiswaId);
  const values: Array<string | number> = [mahasiswaId];
  const filters = ["j.mahasiswa_id = $1"];
  const addFilter = (sql: string, value: string | number): void => {
    values.push(value);
    filters.push(sql.replace("?", `$${values.length}`));
  };
  if (query.tanggal) addFilter("j.tanggal = ?::date", query.tanggal);
  if (query.dari) addFilter("j.tanggal >= ?::date", query.dari);
  if (query.sampai) addFilter("j.tanggal <= ?::date", query.sampai);
  if (query.status) addFilter("j.status = ?", query.status);
  if (query.mata_kuliah_id) addFilter("j.mata_kuliah_id = ?", query.mata_kuliah_id);
  const result = await pool.query<ScheduleRow>(
    `SELECT j.id, j.mahasiswa_id, j.mata_kuliah_id, j.topik,
            j.tanggal::text, j.waktu_mulai::text, j.waktu_selesai::text, j.status,
            mk.kode AS kode_mata_kuliah, mk.nama AS nama_mata_kuliah
     FROM jadwal_belajar j
     LEFT JOIN mata_kuliah mk ON mk.id = j.mata_kuliah_id
     WHERE ${filters.join(" AND ")}
     ORDER BY j.tanggal, j.waktu_mulai`,
    values,
  );
  res.json({ data: result.rows, meta: { total: result.rowCount } });
}));

jadwalRouter.get("/cek-bentrok", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const query = bentrokQuerySchema.parse(req.query);
  await ensureMahasiswa(pool, mahasiswaId);
  const conflicts = await findConflicts(
    mahasiswaId,
    query,
    query.exclude_id,
  );
  res.json({ data: { bentrok: conflicts.length > 0, jadwal_bentrok: conflicts } });
}));

jadwalRouter.post("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const input = jadwalSchema.parse(req.body);
  const data = await inTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [mahasiswaId]);
    await ensureMahasiswa(client, mahasiswaId);
    await ensureMataKuliah(client, mahasiswaId, input.mata_kuliah_id);
    const conflicts = await findConflicts(mahasiswaId, input, undefined, client);
    ensureNoConflict(conflicts);
    const result = await client.query<ScheduleRow>(
      `INSERT INTO jadwal_belajar
       (mahasiswa_id, mata_kuliah_id, topik, tanggal, waktu_mulai, waktu_selesai)
       VALUES ($1, $2, $3, $4::date, $5::time, $6::time)
       RETURNING id, mahasiswa_id, mata_kuliah_id, topik, tanggal::text,
                 waktu_mulai::text, waktu_selesai::text, status`,
      [
        mahasiswaId,
        input.mata_kuliah_id ?? null,
        input.topik,
        input.tanggal,
        normalizeTime(input.waktu_mulai),
        normalizeTime(input.waktu_selesai),
      ],
    );
    return result.rows[0];
  });
  res.status(201).json({ message: "Jadwal belajar berhasil ditambahkan", data });
}));

jadwalRouter.get("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const schedule = await pool.query<ScheduleRow>(
    `SELECT j.id, j.mahasiswa_id, j.mata_kuliah_id, j.topik,
            j.tanggal::text, j.waktu_mulai::text, j.waktu_selesai::text, j.status,
            mk.kode AS kode_mata_kuliah, mk.nama AS nama_mata_kuliah
     FROM jadwal_belajar j
     LEFT JOIN mata_kuliah mk ON mk.id = j.mata_kuliah_id
     WHERE j.id = $1 AND j.mahasiswa_id = $2`,
    [id, mahasiswaId],
  );
  if (schedule.rowCount === 0) throw new HttpError(404, "Jadwal belajar tidak ditemukan");
  const tasks = await pool.query(
    `SELECT t.id, t.nama_tugas, t.deadline::text, t.status
     FROM tugas_jadwal tj JOIN tugas t ON t.id = tj.tugas_id
     WHERE tj.jadwal_id = $1 AND t.mahasiswa_id = $2
     ORDER BY t.deadline`,
    [id, mahasiswaId],
  );
  res.json({ message: "Data jadwal ditemukan", data: { ...schedule.rows[0], tugas: tasks.rows } });
}));

jadwalRouter.put("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const input = jadwalSchema.parse(req.body);
  const data = await inTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [mahasiswaId]);
    await ensureMahasiswa(client, mahasiswaId);
    await ensureMataKuliah(client, mahasiswaId, input.mata_kuliah_id);
    const existing = await client.query("SELECT 1 FROM jadwal_belajar WHERE id = $1 AND mahasiswa_id = $2", [id, mahasiswaId]);
    if (existing.rowCount === 0) throw new HttpError(404, "Jadwal belajar tidak ditemukan");
    const conflicts = await findConflicts(mahasiswaId, input, id, client);
    ensureNoConflict(conflicts);
    const result = await client.query<ScheduleRow>(
      `UPDATE jadwal_belajar
       SET mata_kuliah_id = $1, topik = $2, tanggal = $3::date,
           waktu_mulai = $4::time, waktu_selesai = $5::time
       WHERE id = $6 AND mahasiswa_id = $7
       RETURNING id, mahasiswa_id, mata_kuliah_id, topik, tanggal::text,
                 waktu_mulai::text, waktu_selesai::text, status`,
      [
        input.mata_kuliah_id ?? null,
        input.topik,
        input.tanggal,
        normalizeTime(input.waktu_mulai),
        normalizeTime(input.waktu_selesai),
        id,
        mahasiswaId,
      ],
    );
    return result.rows[0];
  });
  res.json({ message: "Jadwal belajar berhasil diperbarui", data });
}));

jadwalRouter.delete("/:id", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const result = await pool.query(
    "DELETE FROM jadwal_belajar WHERE id = $1 AND mahasiswa_id = $2 RETURNING id",
    [id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Jadwal belajar tidak ditemukan");
  res.json({ message: "Jadwal belajar berhasil dihapus", data: result.rows[0] });
}));

jadwalRouter.patch("/:id/status", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const id = parseId(req.params.id);
  const { status } = statusUpdateSchema.parse(req.body);
  const result = await pool.query(
    `UPDATE jadwal_belajar SET status = $1
     WHERE id = $2 AND mahasiswa_id = $3
     RETURNING id, mahasiswa_id, status`,
    [status, id, mahasiswaId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "Jadwal belajar tidak ditemukan");
  res.json({ message: "Status jadwal berhasil diperbarui", data: result.rows[0] });
}));

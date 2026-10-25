import { Router } from "express";
import { pool } from "../db/pool.js";
import { HttpError, asyncHandler } from "../utils/errors.js";
import { ensureMahasiswa } from "../services/common.js";
import { statistikQuerySchema } from "../utils/schemas.js";
import { getWeekRangeWib } from "../utils/time.js";
import { parseId } from "../utils/validation.js";

export const statistikRouter = Router({ mergeParams: true });

type JadwalStats = {
  total: number;
  selesai: number;
  belum_selesai: number;
  terlewat: number;
  total_jam_terjadwal: number;
  total_jam_selesai: number;
};

type TugasStats = {
  total: number;
  selesai: number;
  belum_selesai: number;
  terlambat: number;
};

function dayDifference(from: string, through: string): number {
  return (Date.parse(`${through}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

statistikRouter.get("/", asyncHandler(async (req, res) => {
  const mahasiswaId = parseId(req.params.mahasiswaId, "mahasiswaId");
  const query = statistikQuerySchema.parse(req.query);
  if ((query.dari && !query.sampai) || (!query.dari && query.sampai)) {
    throw new HttpError(400, "Parameter dari dan sampai harus digunakan bersama");
  }
  const defaultRange = getWeekRangeWib(new Date());
  const from = query.dari ?? defaultRange.from;
  const through = query.sampai ?? defaultRange.through;
  if (from > through) throw new HttpError(400, "dari harus sama dengan atau sebelum sampai");
  if (dayDifference(from, through) > 365) throw new HttpError(400, "Periode maksimum adalah 366 hari");

  await ensureMahasiswa(pool, mahasiswaId);
  const [scheduleResult, taskResult] = await Promise.all([
    pool.query<JadwalStats>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'selesai')::int AS selesai,
              COUNT(*) FILTER (WHERE status = 'belum selesai')::int AS belum_selesai,
              COUNT(*) FILTER (
                WHERE status = 'belum selesai'
                  AND (tanggal + waktu_selesai) < (NOW() AT TIME ZONE 'Asia/Jakarta')
              )::int AS terlewat,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (waktu_selesai - waktu_mulai)) / 3600), 0)::numeric, 2)::float8
                AS total_jam_terjadwal,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (waktu_selesai - waktu_mulai)) / 3600)
                FILTER (WHERE status = 'selesai'), 0)::numeric, 2)::float8 AS total_jam_selesai
       FROM jadwal_belajar
       WHERE mahasiswa_id = $1 AND tanggal BETWEEN $2::date AND $3::date`,
      [mahasiswaId, from, through],
    ),
    pool.query<TugasStats>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'selesai')::int AS selesai,
              COUNT(*) FILTER (WHERE status = 'belum selesai')::int AS belum_selesai,
              COUNT(*) FILTER (
                WHERE status = 'belum selesai'
                  AND deadline < (NOW() AT TIME ZONE 'Asia/Jakarta')
              )::int AS terlambat
       FROM tugas
       WHERE mahasiswa_id = $1
         AND deadline >= $2::date
         AND deadline < ($3::date + INTERVAL '1 day')`,
      [mahasiswaId, from, through],
    ),
  ]);

  res.json({
    data: {
      periode: { dari: from, sampai: through },
      jadwal: scheduleResult.rows[0],
      tugas: taskResult.rows[0],
    },
  });
}));

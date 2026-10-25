import { z } from "zod";
import {
  dateSchema,
  deadlineSchema,
  positiveIntegerSchema,
  statusSchema,
  timeSchema,
} from "./validation.js";

const optionalNullableId = positiveIntegerSchema.nullable().optional();
const optionalNullableText = z.string().trim().nullable().optional();

export const mahasiswaCreateSchema = z.object({
  nim: z.string().trim().min(1).max(20),
  nama: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(100).nullable().optional(),
}).strict();

export const mahasiswaUpdateSchema = mahasiswaCreateSchema;

export const mataKuliahSchema = z.object({
  kode: z.string().trim().min(1).max(20),
  nama: z.string().trim().min(1).max(100),
}).strict();

export const jadwalSchema = z.object({
  topik: z.string().trim().min(1).max(150),
  tanggal: dateSchema,
  waktu_mulai: timeSchema,
  waktu_selesai: timeSchema,
  mata_kuliah_id: optionalNullableId,
}).strict().refine(
  (value) => normalizeTime(value.waktu_selesai) > normalizeTime(value.waktu_mulai),
  { path: ["waktu_selesai"], message: "waktu_selesai harus setelah waktu_mulai pada hari yang sama" },
);

export const tugasSchema = z.object({
  nama_tugas: z.string().trim().min(1).max(150),
  deadline: deadlineSchema,
  mata_kuliah_id: optionalNullableId,
  deskripsi: optionalNullableText,
}).strict();

export const statusUpdateSchema = z.object({ status: statusSchema }).strict();
export const linkSchema = z.object({ jadwal_id: positiveIntegerSchema }).strict();

export const jadwalQuerySchema = z.object({
  tanggal: dateSchema.optional(),
  dari: dateSchema.optional(),
  sampai: dateSchema.optional(),
  status: statusSchema.optional(),
  mata_kuliah_id: positiveIntegerSchema.optional(),
}).strict().refine(
  (query) => !query.dari || !query.sampai || query.dari <= query.sampai,
  { path: ["sampai"], message: "sampai harus sama dengan atau setelah dari" },
);

export const tugasQuerySchema = z.object({
  status: statusSchema.optional(),
  mata_kuliah_id: positiveIntegerSchema.optional(),
}).strict();

export const bentrokQuerySchema = z.object({
  tanggal: dateSchema,
  waktu_mulai: timeSchema,
  waktu_selesai: timeSchema,
  exclude_id: positiveIntegerSchema.optional(),
}).strict().refine(
  (query) => normalizeTime(query.waktu_selesai) > normalizeTime(query.waktu_mulai),
  { path: ["waktu_selesai"], message: "waktu_selesai harus setelah waktu_mulai" },
);

export const mendekatiQuerySchema = z.object({
  hari: z.coerce.number().int().min(1).max(30).default(3),
}).strict();

export const statistikQuerySchema = z.object({
  dari: dateSchema.optional(),
  sampai: dateSchema.optional(),
}).strict();

export const idQuerySchema = z.object({
  tugasId: positiveIntegerSchema,
  jadwalId: positiveIntegerSchema,
}).strict();

export type MahasiswaInput = z.infer<typeof mahasiswaCreateSchema>;
export type MataKuliahInput = z.infer<typeof mataKuliahSchema>;
export type JadwalInput = z.infer<typeof jadwalSchema>;
export type TugasInput = z.infer<typeof tugasSchema>;

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

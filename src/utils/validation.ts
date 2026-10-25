import { z } from "zod";
import { HttpError } from "./errors.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const deadlinePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function isValidDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === 0) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year!, month! - 1, day!);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export const dateSchema = z.string().refine(isValidDate, "Gunakan tanggal valid berformat YYYY-MM-DD");
export const timeSchema = z.string().regex(timePattern, "Gunakan waktu HH:MM atau HH:MM:SS (WIB, tanpa offset)");
export const deadlineSchema = z
  .string()
  .regex(deadlinePattern, "Gunakan YYYY-MM-DDTHH:MM atau YYYY-MM-DDTHH:MM:SS tanpa offset")
  .refine((value) => isValidDate(value.slice(0, 10)), "Tanggal deadline tidak valid");

const positiveIdString = z
  .string()
  .regex(/^[1-9]\d*$/, "Harus berupa bilangan bulat positif")
  .transform(Number)
  .pipe(z.number().int().positive());

export const idSchema = positiveIdString;

export function parseId(value: string | string[] | undefined, field = "id"): number {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} harus bilangan bulat positif`);
  }
  const result = idSchema.safeParse(value);
  if (!result.success) throw new HttpError(400, `${field} harus bilangan bulat positif`);
  return result.data;
}

export function parseQueryId(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  const result = idSchema.safeParse(value);
  if (!result.success) throw new HttpError(400, `${field} harus bilangan bulat positif`);
  return result.data;
}

export const statusSchema = z.enum(["belum selesai", "selesai"], {
  error: "Status harus 'belum selesai' atau 'selesai'",
});

export const positiveIntegerSchema = z.union([
  z.number().int().positive(),
  positiveIdString,
]);

export function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export function normalizeDeadline(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

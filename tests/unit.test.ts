import { describe, expect, it } from "vitest";
import { overlaps } from "../src/utils/overlap.js";
import { getWeekRangeWib, classifyDeadline } from "../src/utils/time.js";
import {
  dateSchema,
  deadlineSchema,
  timeSchema,
} from "../src/utils/validation.js";
import { jadwalSchema } from "../src/utils/schemas.js";

describe("overlaps", () => {
  const interval = {
    tanggal: "2026-10-26",
    waktu_mulai: "10:00",
    waktu_selesai: "11:00",
  };

  it("mengenali interval yang bertumpang tindih", () => {
    expect(overlaps(interval, {
      tanggal: "2026-10-26",
      waktu_mulai: "10:30:00",
      waktu_selesai: "11:30",
    })).toBe(true);
  });

  it("tidak menganggap interval yang hanya bersinggungan sebagai bentrok", () => {
    expect(overlaps(interval, {
      tanggal: "2026-10-26",
      waktu_mulai: "11:00:00",
      waktu_selesai: "12:00",
    })).toBe(false);
  });

  it("mengenali interval yang berisi seluruh interval lain", () => {
    expect(overlaps({
      tanggal: "2026-10-26",
      waktu_mulai: "09:00",
      waktu_selesai: "12:00",
    }, interval)).toBe(true);
  });

  it("tidak bentrok bila tanggal berbeda", () => {
    expect(overlaps(interval, {
      tanggal: "2026-10-27",
      waktu_mulai: "10:30",
      waktu_selesai: "10:45",
    })).toBe(false);
  });
});

describe("waktu WIB", () => {
  it("menghitung rentang Senin-Minggu untuk waktu UTC", () => {
    expect(getWeekRangeWib(new Date("2026-10-25T12:00:00.000Z"))).toEqual({
      from: "2026-10-19",
      through: "2026-10-25",
    });
  });

  it("mengelompokkan tugas terlambat, mendekati, dan selesai", () => {
    const now = "2026-10-25T12:00:00";
    expect(classifyDeadline("2026-10-25T11:59:59", "belum selesai", now, 3)).toBe("terlambat");
    expect(classifyDeadline("2026-10-27T12:00:00", "belum selesai", now, 3)).toBe("mendekati");
    expect(classifyDeadline("2026-10-29T12:00:00", "belum selesai", now, 3)).toBeNull();
    expect(classifyDeadline("2026-10-25T11:00:00", "selesai", now, 3)).toBeNull();
  });
});

describe("validasi tanggal dan waktu lokal WIB", () => {
  it("menerima tanggal kalender dan format waktu valid", () => {
    expect(dateSchema.safeParse("2024-02-29").success).toBe(true);
    expect(timeSchema.safeParse("23:59").success).toBe(true);
    expect(timeSchema.safeParse("23:59:59").success).toBe(true);
    expect(deadlineSchema.safeParse("2026-10-25T12:30").success).toBe(true);
  });

  it("menolak tanggal/waktu tidak valid dan deadline ber-offset", () => {
    expect(dateSchema.safeParse("2025-02-29").success).toBe(false);
    expect(timeSchema.safeParse("24:00").success).toBe(false);
    expect(deadlineSchema.safeParse("2026-10-25T12:30:00Z").success).toBe(false);
    expect(deadlineSchema.safeParse("2026-10-25T12:30+07:00").success).toBe(false);
  });

  it("menolak jadwal dengan waktu selesai yang sama setelah normalisasi", () => {
    expect(jadwalSchema.safeParse({
      topik: "Belajar",
      tanggal: "2026-10-26",
      waktu_mulai: "10:00",
      waktu_selesai: "10:00:00",
    }).success).toBe(false);
    expect(jadwalSchema.safeParse({
      topik: "Belajar",
      tanggal: "2026-10-26",
      waktu_mulai: "10:00",
      waktu_selesai: "10:00",
    }).success).toBe(false);
  });
});

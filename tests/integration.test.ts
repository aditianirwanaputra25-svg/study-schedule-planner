import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (process.env.NODE_ENV === "production") {
  throw new Error("Tes integrasi dilarang berjalan saat NODE_ENV=production");
}
if (testDatabaseUrl && testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL tidak boleh sama dengan DATABASE_URL");
}
if (!testDatabaseUrl) {
  console.warn("Tes integrasi BELUM DIJALANKAN: TEST_DATABASE_URL tidak dikonfigurasi.");
}

const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

integrationDescribe("REST API dengan PostgreSQL khusus tes", () => {
  let app: (typeof import("../src/app.js"))["default"];
  let db: (typeof import("../src/db/pool.js"))["pool"];
  let mahasiswaId: number;
  let migrationSql: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl!;
    process.env.NODE_ENV = "test";
    ({ pool: db } = await import("../src/db/pool.js"));
    ({ default: app } = await import("../src/app.js"));
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    migrationSql = await readFile(
      fileURLToPath(new URL("../db/migrations/001_init.sql", import.meta.url)),
      "utf8",
    );
    await db.query(migrationSql);
    await db.query(migrationSql);
  });

  beforeEach(async () => {
    await db.query("TRUNCATE tugas_jadwal, tugas, jadwal_belajar, mata_kuliah, mahasiswa RESTART IDENTITY CASCADE");
    const result = await db.query<{ id: number }>(
      "INSERT INTO mahasiswa (nim, nama) VALUES ('TEST-001', 'Mahasiswa Tes') RETURNING id",
    );
    mahasiswaId = result.rows[0]!.id;
  });

  afterAll(async () => {
    await db?.end();
  });

  it("memiliki lima tabel domain dan menjalankan DDL migrasi berulang kali", async () => {
    await db.query(migrationSql);
    const result = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [["mahasiswa", "mata_kuliah", "jadwal_belajar", "tugas", "tugas_jadwal"]],
    );
    expect(result.rows[0]!.total).toBe(5);
  });

  it("menjalankan health check dan CRUD mahasiswa", async () => {
    await request(app).get("/api/health").expect(200);
    const created = await request(app)
      .post("/api/mahasiswa")
      .send({ nim: "TEST-002", nama: "Mahasiswa Baru", email: "baru@example.test" })
      .expect(201);
    const id = created.body.data.id as number;
    await request(app)
      .post("/api/mahasiswa")
      .send({ nim: "TEST-002", nama: "NIM duplikat" })
      .expect(409);
    await request(app)
      .post("/api/mahasiswa")
      .send({ nim: "TEST-003", nama: "Email duplikat", email: "baru@example.test" })
      .expect(409);
    await request(app).get(`/api/mahasiswa/${id}`).expect(200);
    await request(app)
      .put(`/api/mahasiswa/${id}`)
      .send({ nim: "TEST-003", nama: "Mahasiswa Update", email: null })
      .expect(200);
    await request(app).delete(`/api/mahasiswa/${id}`).expect(200);
  });

  it("menghapus seluruh data turunan ketika mahasiswa dihapus", async () => {
    const course = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/mata-kuliah`)
      .send({ kode: "CASCADE-1", nama: "Mata Kuliah Cascade" })
      .expect(201);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send({
        topik: "Jadwal Cascade",
        tanggal: "2026-10-26",
        waktu_mulai: "09:00",
        waktu_selesai: "10:00",
        mata_kuliah_id: course.body.data.id,
      })
      .expect(201);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({
        nama_tugas: "Tugas Cascade",
        deadline: "2026-10-26T12:00",
        mata_kuliah_id: course.body.data.id,
      })
      .expect(201);
    await request(app).delete(`/api/mahasiswa/${mahasiswaId}`).expect(200);
    for (const table of ["mata_kuliah", "jadwal_belajar", "tugas"]) {
      const count = await db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM ${table} WHERE mahasiswa_id = $1`,
        [mahasiswaId],
      );
      expect(count.rows[0]!.total).toBe(0);
    }
  });

  it("menolak validasi, akses silang, dan route yang tidak ada", async () => {
    const otherStudent = await db.query<{ id: number }>(
      "INSERT INTO mahasiswa (nim, nama) VALUES ('OTHER-001', 'Mahasiswa Lain') RETURNING id",
    );
    const otherCourse = await db.query<{ id: number }>(
      "INSERT INTO mata_kuliah (mahasiswa_id, kode, nama) VALUES ($1, 'OTHER-DB', 'Basis Data Lain') RETURNING id",
      [otherStudent.rows[0]!.id],
    );
    const otherTask = await db.query<{ id: number }>(
      `INSERT INTO tugas (mahasiswa_id, nama_tugas, deadline)
       VALUES ($1, 'Tugas privat', '2026-10-26 10:00:00') RETURNING id`,
      [otherStudent.rows[0]!.id],
    );
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send({ topik: "", tanggal: "2026-02-30", waktu_mulai: "10:00", waktu_selesai: "09:00" })
      .expect(400);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send({
        topik: "Mata kuliah lintas mahasiswa",
        tanggal: "2026-10-26",
        waktu_mulai: "10:00",
        waktu_selesai: "11:00",
        mata_kuliah_id: otherCourse.rows[0]!.id,
      })
      .expect(400);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({
        nama_tugas: "Mata kuliah lintas mahasiswa",
        deadline: "2026-10-26T12:00",
        mata_kuliah_id: otherCourse.rows[0]!.id,
      })
      .expect(400);
    await request(app).get(`/api/mahasiswa/${mahasiswaId + 999}/tugas`).expect(404);
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/tugas/${otherTask.rows[0]!.id}`).expect(404);
    await request(app).get("/api/route-tidak-ada").expect(404);
  });

  it("menangani jadwal bentrok, interval berurutan, dan PATCH status", async () => {
    const base = {
      topik: "Belajar basis data",
      tanggal: "2026-10-26",
      waktu_mulai: "10:00",
      waktu_selesai: "11:00",
    };
    const first = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send(base)
      .expect(201);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send({ ...base, topik: "Jadwal bentrok", waktu_mulai: "10:30", waktu_selesai: "11:30" })
      .expect(409);
    const next = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send({ ...base, topik: "Jadwal berurutan", waktu_mulai: "11:00", waktu_selesai: "12:00" })
      .expect(201);
    await request(app)
      .get(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar/cek-bentrok`)
      .query({ tanggal: base.tanggal, waktu_mulai: "10:30", waktu_selesai: "11:30" })
      .expect(200)
      .then((response) => expect(response.body.data.bentrok).toBe(true));
    await request(app)
      .put(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar/${first.body.data.id}`)
      .send({ ...base, topik: "Jadwal diperbarui" })
      .expect(200);
    await request(app)
      .patch(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar/${next.body.data.id}/status`)
      .send({ status: "selesai" })
      .expect(200);
  });

  it("mengelola mata kuliah, tugas, relasi tugas-jadwal, dan statistik", async () => {
    const courseResponse = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/mata-kuliah`)
      .send({ kode: "DB-1", nama: "Basis Data" })
      .expect(201);
    const courseId = courseResponse.body.data.id as number;
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/mata-kuliah`)
      .send({ kode: "DB-1", nama: "Kode duplikat" })
      .expect(409);
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/mata-kuliah`).expect(200);
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/mata-kuliah/${courseId}`).expect(200);
    await request(app)
      .put(`/api/mahasiswa/${mahasiswaId}/mata-kuliah/${courseId}`)
      .send({ kode: "DB-2", nama: "Basis Data" })
      .expect(200);
    const scheduleResponse = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`)
      .send({
        topik: "ERD",
        tanggal: "2026-10-26",
        waktu_mulai: "13:00",
        waktu_selesai: "14:00",
        mata_kuliah_id: courseId,
      })
      .expect(201);
    const scheduleId = scheduleResponse.body.data.id as number;
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar`).expect(200);
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar/${scheduleId}`).expect(200);
    await request(app)
      .put(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar/${scheduleId}`)
      .send({
        topik: "ERD revisi",
        tanggal: "2026-10-26",
        waktu_mulai: "13:00",
        waktu_selesai: "14:00",
        mata_kuliah_id: courseId,
      })
      .expect(200);
    const taskResponse = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({
        nama_tugas: "Tugas ERD",
        deadline: "2026-10-26T16:00",
        mata_kuliah_id: courseId,
      })
      .expect(201);
    const taskId = taskResponse.body.data.id as number;
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/tugas`).expect(200);
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}`).expect(200);
    await request(app)
      .put(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}`)
      .send({
        nama_tugas: "Tugas ERD revisi",
        deadline: "2026-10-26T17:00",
        mata_kuliah_id: courseId,
        deskripsi: null,
      })
      .expect(200);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}/jadwal`)
      .send({ jadwal_id: scheduleId })
      .expect(201);
    await request(app).get(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}/jadwal`).expect(200);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}/jadwal`)
      .send({ jadwal_id: scheduleId })
      .expect(409);
    await request(app)
      .patch(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}/status`)
      .send({ status: "selesai" })
      .expect(200);
    const stats = await request(app)
      .get(`/api/mahasiswa/${mahasiswaId}/statistik`)
      .query({ dari: "2026-10-26", sampai: "2026-10-26" })
      .expect(200);
    expect(stats.body.data.jadwal).toMatchObject({
      total: 1,
      selesai: 0,
      belum_selesai: 1,
      total_jam_terjadwal: 1,
    });
    expect(stats.body.data.tugas).toMatchObject({
      total: 1,
      selesai: 1,
      belum_selesai: 0,
    });
    await request(app)
      .delete(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}/jadwal/${scheduleId}`)
      .expect(200);
    await request(app).delete(`/api/mahasiswa/${mahasiswaId}/mata-kuliah/${courseId}`).expect(200);
    const updatedTask = await request(app).get(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}`).expect(200);
    expect(updatedTask.body.data.mata_kuliah_id).toBeNull();
    await request(app).delete(`/api/mahasiswa/${mahasiswaId}/tugas/${taskId}`).expect(200);
    await request(app).delete(`/api/mahasiswa/${mahasiswaId}/jadwal-belajar/${scheduleId}`).expect(200);
  });

  it("mengelompokkan tugas terlambat dan mendekati, serta mengecualikan yang selesai", async () => {
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const localDeadline = (offsetMilliseconds: number): string => {
      const deadline = new Date(nowWib.getTime() + offsetMilliseconds).toISOString();
      return deadline.slice(0, 16);
    };
    const overdue = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({ nama_tugas: "Lampau selesai", deadline: localDeadline(-120_000) })
      .expect(201);
    const late = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({ nama_tugas: "Lampau aktif", deadline: localDeadline(-60_000) })
      .expect(201);
    const upcoming = await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({ nama_tugas: "Dekat", deadline: localDeadline(24 * 60 * 60 * 1000) })
      .expect(201);
    await request(app)
      .post(`/api/mahasiswa/${mahasiswaId}/tugas`)
      .send({ nama_tugas: "Jauh", deadline: localDeadline(40 * 24 * 60 * 60 * 1000) })
      .expect(201);
    await request(app)
      .patch(`/api/mahasiswa/${mahasiswaId}/tugas/${overdue.body.data.id}/status`)
      .send({ status: "selesai" })
      .expect(200);
    const response = await request(app)
      .get(`/api/mahasiswa/${mahasiswaId}/tugas/mendekati-deadline`)
      .expect(200);
    expect(response.body.data.terlambat.map((task: { id: number }) => task.id)).toContain(late.body.data.id);
    expect(response.body.data.terlambat.map((task: { id: number }) => task.id)).not.toContain(overdue.body.data.id);
    expect(response.body.data.mendekati.map((task: { id: number }) => task.id))
      .toContain(upcoming.body.data.id);
  });
});

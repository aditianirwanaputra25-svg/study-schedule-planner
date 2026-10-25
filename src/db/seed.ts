import { inTransaction } from "./transaction.js";
import { pool } from "./pool.js";

try {
  const ids = await inTransaction(async (client) => {
    const studentResult = await client.query<{ id: number }>(
      `INSERT INTO mahasiswa (nim, nama, email)
       VALUES ('DEMO-001', 'Mahasiswa Contoh', 'mahasiswa@example.test')
       ON CONFLICT (nim) DO UPDATE SET nama = EXCLUDED.nama
       RETURNING id`,
    );
    const mahasiswaId = studentResult.rows[0]!.id;

    const courseResult = await client.query<{ id: number }>(
      `INSERT INTO mata_kuliah (mahasiswa_id, kode, nama)
       VALUES ($1, 'BD-101', 'Basis Data')
       ON CONFLICT (mahasiswa_id, kode) DO UPDATE SET nama = EXCLUDED.nama
       RETURNING id`,
      [mahasiswaId],
    );
    const mataKuliahId = courseResult.rows[0]!.id;

    const scheduleDate = await client.query<{ tanggal: string }>(
      "SELECT ((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1)::text AS tanggal",
    );
    const scheduleDay = scheduleDate.rows[0]!.tanggal;
    const existingSchedule = await client.query<{ id: number }>(
      `SELECT id FROM jadwal_belajar
       WHERE mahasiswa_id = $1 AND topik = 'Perancangan basis data' AND tanggal = $2::date`,
      [mahasiswaId, scheduleDay],
    );
    const schedule = existingSchedule.rows[0] ?? (
      await client.query<{ id: number }>(
        `INSERT INTO jadwal_belajar
         (mahasiswa_id, mata_kuliah_id, topik, tanggal, waktu_mulai, waktu_selesai)
         VALUES ($1, $2, 'Perancangan basis data', $3::date, '09:00', '10:30')
         RETURNING id`,
        [mahasiswaId, mataKuliahId, scheduleDay],
      )
    ).rows[0]!;

    const deadline = await client.query<{ waktu: string }>(
      "SELECT ((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 3)::text || ' 00:00:00' AS waktu",
    );
    const taskDeadline = deadline.rows[0]!.waktu;
    const existingTask = await client.query<{ id: number }>(
      `SELECT id FROM tugas
       WHERE mahasiswa_id = $1 AND nama_tugas = 'Laporan ERD' AND deadline = $2::timestamp`,
      [mahasiswaId, taskDeadline],
    );
    const task = existingTask.rows[0] ?? (
      await client.query<{ id: number }>(
        `INSERT INTO tugas (mahasiswa_id, mata_kuliah_id, nama_tugas, deskripsi, deadline)
         VALUES ($1, $2, 'Laporan ERD', 'Contoh seed fiktif', $3::timestamp)
         RETURNING id`,
        [mahasiswaId, mataKuliahId, taskDeadline],
      )
    ).rows[0]!;

    if (task.id && schedule.id) {
      await client.query(
        "INSERT INTO tugas_jadwal (tugas_id, jadwal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [task.id, schedule.id],
      );
    }
    return { mahasiswaId, mataKuliahId };
  });

  console.log(`Seed selesai untuk mahasiswa ${ids.mahasiswaId}, mata kuliah ${ids.mataKuliahId}.`);
} catch (error) {
  console.error("Seed database gagal:", error instanceof Error ? error.message : "kesalahan tidak diketahui");
  process.exitCode = 1;
} finally {
  await pool.end();
}

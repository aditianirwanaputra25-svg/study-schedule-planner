CREATE TABLE IF NOT EXISTS mahasiswa (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nim VARCHAR(20) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mata_kuliah (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mahasiswa_id INT NOT NULL REFERENCES mahasiswa(id) ON DELETE CASCADE,
  kode VARCHAR(20) NOT NULL,
  nama VARCHAR(100) NOT NULL,
  UNIQUE (mahasiswa_id, kode)
);

CREATE TABLE IF NOT EXISTS jadwal_belajar (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mahasiswa_id INT NOT NULL REFERENCES mahasiswa(id) ON DELETE CASCADE,
  mata_kuliah_id INT NULL REFERENCES mata_kuliah(id) ON DELETE SET NULL,
  topik VARCHAR(150) NOT NULL,
  tanggal DATE NOT NULL,
  waktu_mulai TIME NOT NULL,
  waktu_selesai TIME NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'belum selesai'
    CHECK (status IN ('belum selesai', 'selesai')),
  CHECK (waktu_selesai > waktu_mulai)
);

CREATE TABLE IF NOT EXISTS tugas (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mahasiswa_id INT NOT NULL REFERENCES mahasiswa(id) ON DELETE CASCADE,
  mata_kuliah_id INT NULL REFERENCES mata_kuliah(id) ON DELETE SET NULL,
  nama_tugas VARCHAR(150) NOT NULL,
  deskripsi TEXT,
  deadline TIMESTAMP NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'belum selesai'
    CHECK (status IN ('belum selesai', 'selesai'))
);

CREATE TABLE IF NOT EXISTS tugas_jadwal (
  tugas_id INT NOT NULL REFERENCES tugas(id) ON DELETE CASCADE,
  jadwal_id INT NOT NULL REFERENCES jadwal_belajar(id) ON DELETE CASCADE,
  PRIMARY KEY (tugas_id, jadwal_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_tanggal ON jadwal_belajar (mahasiswa_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_tugas_deadline ON tugas (mahasiswa_id, deadline);
CREATE INDEX IF NOT EXISTS idx_tugas_jadwal_jadwal_id ON tugas_jadwal (jadwal_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_mata_kuliah_id ON jadwal_belajar (mata_kuliah_id);
CREATE INDEX IF NOT EXISTS idx_tugas_mata_kuliah_id ON tugas (mata_kuliah_id);

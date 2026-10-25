import cors from "cors";
import express from "express";
import { pool } from "./db/pool.js";
import { errorHandler, notFoundHandler } from "./utils/errors.js";
import { jadwalRouter } from "./routes/jadwal.js";
import { mahasiswaRouter } from "./routes/mahasiswa.js";
import { mataKuliahRouter } from "./routes/mata-kuliah.js";
import { relasiRouter } from "./routes/relasi.js";
import { statistikRouter } from "./routes/statistik.js";
import { tugasRouter } from "./routes/tugas.js";

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/", (_req, res) => {
  res.json({
    message: "Study Schedule Planner API",
    status: "ok",
    endpoints: {
      health: "/api/health",
      mahasiswa: "/api/mahasiswa"
    }
  });
});

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ message: "API dan database siap", data: { status: "ok" } });
  } catch (error) {
    next(error);
  }
});

app.use("/api/mahasiswa", mahasiswaRouter);
app.use("/api/mahasiswa/:mahasiswaId/mata-kuliah", mataKuliahRouter);
app.use("/api/mahasiswa/:mahasiswaId/jadwal-belajar", jadwalRouter);
app.use("/api/mahasiswa/:mahasiswaId/tugas", tugasRouter);
app.use("/api/mahasiswa/:mahasiswaId/tugas", relasiRouter);
app.use("/api/mahasiswa/:mahasiswaId/statistik", statistikRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

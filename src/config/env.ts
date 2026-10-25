import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "wajib diisi").url("harus berupa URL database yang valid"),
  TEST_DATABASE_URL: z.string().url("harus berupa URL database yang valid").optional(),
  DATABASE_SSL: z.enum(["true", "false"]).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Konfigurasi lingkungan tidak valid: ${details}`);
}

export const env = {
  ...parsed.data,
  databaseSsl:
    parsed.data.DATABASE_SSL === undefined
      ? parsed.data.NODE_ENV === "production"
      : parsed.data.DATABASE_SSL === "true",
};

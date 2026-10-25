import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const asyncHandler = (
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validasi gagal",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (code === "23505") {
      res.status(409).json({ error: "Data dengan nilai unik tersebut sudah ada" });
      return;
    }
    if (code === "23503") {
      res.status(409).json({ error: "Data masih digunakan atau relasi tidak valid" });
      return;
    }
    if (code === "23514" || code === "22P02") {
      res.status(400).json({ error: "Nilai data tidak valid" });
      return;
    }
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "JSON request tidak valid" });
    return;
  }

  console.error("Kesalahan server:", error instanceof Error ? error.message : "Kesalahan tidak diketahui");
  res.status(500).json({ error: "Terjadi kesalahan internal server" });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route tidak ditemukan" });
};

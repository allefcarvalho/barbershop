import { Response } from 'express';

/** Erro de negócio com status HTTP e código estável para o front traduzir. */
export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
  }
}

export function sendSuccess<T>(res: Response, data: T | null, message?: string, status = 200) {
  return res.status(status).json({ success: true, data, message });
}

export function sendCreated<T>(res: Response, data: T, message?: string) {
  return sendSuccess(res, data, message, 201);
}

export function sendError(res: Response, message: string, status = 400, code?: string) {
  return res.status(status).json({ success: false, message, code });
}

export function sendPaginated<T>(res: Response, data: T[], total: number, page: number, pageSize: number) {
  return res.status(200).json({
    success: true,
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

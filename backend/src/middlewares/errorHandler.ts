import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { HttpError } from '../utils/apiResponse';
import { isProd } from '../config/env';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      message: 'Erro de validação',
      code: 'VALIDATION',
      errors: err.flatten().fieldErrors,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Registro já existe', code: 'DUPLICATE' });
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Registro não encontrado', code: 'NOT_FOUND' });
  }

  // JSON malformado no body
  if ((err as any).type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'JSON inválido', code: 'BAD_JSON' });
  }

  console.error('[ERROR]', err);
  return res.status(500).json({
    success: false,
    message: isProd ? 'Erro interno do servidor' : err.message,
    code: 'INTERNAL',
  });
}

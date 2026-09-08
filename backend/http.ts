import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
export const requestTelemetry: RequestHandler = (req, res, next) => {
  const id = randomUUID(); const started = Date.now(); res.locals.requestId = id; res.setHeader('X-Request-ID', id);
  res.on('finish', () => { if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ event: 'request', requestId: id, method: req.method,
    route: req.route?.path ?? 'unmatched', status: res.statusCode, durationMs: Date.now() - started })); }); next();
};
export function structuredLimit(options: Partial<Options>) {
  return rateLimit({ windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false, ...options,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait before retrying.', requestId: res.locals.requestId } }) });
}
export const apiErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_BODY', message: status === 500 ? 'Service temporarily unavailable.' : 'Invalid request body.', requestId: res.locals.requestId } });
};

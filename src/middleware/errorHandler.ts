import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    logger.warn('Validation error', {
      errors: error.issues, 
      url: request.url,
      method: request.method,
    });

    return reply.status(400).send({
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: error.issues,
    });
  }

  // Handle custom AppError
  if (error instanceof AppError) {
    logger.warn('Application error', {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      url: request.url,
      method: request.method,
    });

    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...(error.details && { details: error.details }),
    });
  }

  // Handle Fastify errors
  if ('statusCode' in error) {
    logger.error('Fastify error', error, {
      statusCode: error.statusCode,
      url: request.url,
      method: request.method,
    });

    return reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  }

  // Handle unknown errors
  logger.error('Unhandled error', error, {
    url: request.url,
    method: request.method,
  });

  return reply.status(500).send({
    error: 'Internal Server Error',
  });
}

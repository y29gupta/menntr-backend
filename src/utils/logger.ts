import { FastifyBaseLogger } from 'fastify';

export interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  status: 'success' | 'failure';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export class Logger {
  constructor(private logger: FastifyBaseLogger) {}

  info(message: string, context?: Record<string, any>) {
    this.logger.info({ ...context }, message);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.logger.error(
      {
        err: error,
        ...context,
        errorMessage: error?.message,
        errorStack: error?.stack,
      },
      message
    );
  }

  warn(message: string, context?: Record<string, any>) {
    this.logger.warn({ ...context }, message);
  }

  debug(message: string, context?: Record<string, any>) {
    this.logger.debug({ ...context }, message);
  }

  audit(data: AuditLogData) {
    this.logger.info(
      {
        type: 'AUDIT',
        timestamp: new Date().toISOString(),
        ...data,
      },
      `Audit: ${data.action} on ${data.resource}`
    );
  }
}

import { FastifyBaseLogger } from 'fastify';

export interface AuditLogData {
  user_id?: string;
  action: string;
  resource: string;
  resource_id?: string;
  status: 'success' | 'failure';
  ip_address?: string;
  user_agent?: string;
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
        error_message: error?.message,
        error_stack: error?.stack,
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

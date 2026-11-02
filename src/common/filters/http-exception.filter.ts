import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorName = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          message = body.message as string[];
        } else if (typeof body.message === 'string') {
          message = body.message;
        }
        if (typeof body.error === 'string') {
          errorName = body.error;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack ?? exception.message);
      message = exception.message;
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      data: null,
      message,
      statusCode: status,
      error: errorName,
      path: request.url,
    });
  }
}

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiSuccessBody<T> {
  data: T;
  message: string;
  statusCode: number;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccessBody<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessBody<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode ?? 200;
    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        message: 'Success',
        statusCode,
      })),
    );
  }
}

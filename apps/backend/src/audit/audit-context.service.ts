import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export type AuditRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditRequestContext>();

  run<T>(context: AuditRequestContext, callback: () => T) {
    return this.storage.run(context, callback);
  }

  current() {
    return this.storage.getStore();
  }
}

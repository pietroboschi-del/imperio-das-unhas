import type { Request } from 'express';
export type ImperioPrincipal = {
  userId: string;
  username: string;
  displayName: string;
  networkAdmin: boolean;
  unitIds: string[];
  permissions: unknown;
  sessionId: string;
  csrfToken?: string;
};
export type ImperioRequest = Request & { principal?: ImperioPrincipal; unitId?: string };

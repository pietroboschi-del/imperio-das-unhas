import type { Request } from 'express';

export type ImperioUnitAccess = {
  unitId: string;
  role: string;
  permissions: string[];
};

export type ImperioPrincipal = {
  userId: string;
  username: string;
  displayName: string;
  systemRole: 'OWNER' | 'ADMINISTRATIVE' | 'OPERATOR';
  networkAdmin: boolean;
  unitIds: string[];
  permissions: string[];
  unitAccesses: ImperioUnitAccess[];
  sessionId: string;
};

export type ImperioRequest = Request & { principal?: ImperioPrincipal; unitId?: string };

export const BACKEND_PERMISSIONS = [
  'units.read',
  'catalog.read','catalog.manage',
  'professionals.read','professionals.manage','professionals.compensation.manage',
  'clients.read','clients.manage','clients.duplicates.review',
  'agenda.read','agenda.manage',
  'cash.read','cash.open','cash.adjust','cash.close','cash.reopen',
  'finance.read','finance.manage','finance.receivables.settle',
  'stock.read','stock.manage',
  'reports.read',
  'tasks.read','tasks.manage',
  'users.manage',
  'integrations.use','integrations.configure',
  'migration.manage',
] as const;

export type BackendPermission = typeof BACKEND_PERMISSIONS[number];

export function normalizePermissions(input: unknown): string[] {
  if (Array.isArray(input)) return [...new Set(input.map(String).map(x=>x.trim()).filter(Boolean))].sort();
  if (!input || typeof input !== 'object') return [];
  return Object.entries(input as Record<string,unknown>)
    .filter(([,v])=>v === true)
    .map(([k])=>String(k).trim())
    .filter(Boolean)
    .sort();
}

export function permissionSet(...inputs: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const input of inputs) for (const permission of normalizePermissions(input)) out.add(permission);
  return out;
}

export function hasPermissions(granted: Iterable<string>, required: Iterable<string>): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has('*')) return true;
  for (const permission of required) if (!set.has(permission)) return false;
  return true;
}

export type AccessDecisionInput = {
  networkAdmin: boolean;
  globalPermissions: unknown;
  unitAccesses: Array<{unitId:string;permissions:unknown}>;
  adminOnly?: boolean;
  unitScoped?: boolean;
  unitId?: string;
  requiredPermissions?: string[];
};

export function evaluateAccess(input:AccessDecisionInput): {allowed:boolean;reason:string} {
  if(input.networkAdmin) return {allowed:true,reason:'network_admin'};
  if(input.adminOnly) return {allowed:false,reason:'network_admin_required'};
  const required=input.requiredPermissions||[];
  // Network agenda coordination is a domain-scoped grant, not a unit-wide grant.
  // Unit-local agenda permissions still require a matching UnitAccess.
  const networkAgendaGrant=input.unitScoped&&!!input.unitId&&
    input.unitAccesses.length>0&&required.length>0&&
    required.every(permission=>permission==='agenda.read'||permission==='agenda.manage')&&
    hasPermissions(permissionSet(input.globalPermissions),required);
  let unitPermissions:unknown=[];
  if(input.unitScoped){
    if(!input.unitId) return {allowed:false,reason:'unit_required'};
    const access=input.unitAccesses.find(x=>x.unitId===input.unitId);
    if(!access&&!networkAgendaGrant) return {allowed:false,reason:'unit_denied'};
    unitPermissions=access?.permissions||[];
  }
  if(required.length&&!hasPermissions(permissionSet(input.globalPermissions,unitPermissions),required))return {allowed:false,reason:'permission_denied'};
  return {allowed:true,reason:'allowed'};
}

export const OWNER_ONLY_PERMISSIONS = new Set(['users.manage','migration.manage','integrations.configure']);
export function sanitizeAssignablePermissions(input:unknown): string[] {
  const known=new Set<string>(BACKEND_PERMISSIONS as readonly string[]);
  return normalizePermissions(input).filter(x=>known.has(x)&&!OWNER_ONLY_PERMISSIONS.has(x));
}

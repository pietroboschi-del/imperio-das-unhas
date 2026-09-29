import { BadRequestException } from '@nestjs/common';
import { ENTITY_CONTRACTS, MigrationEnvelope, SENSITIVE_KEY, SUPPORTED_MIN_SCHEMA, V94_CONTRACT_VERSION } from './contracts';
import { payloadHash, payloadHashMatches } from './hash';

export type EnvelopeValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: Record<string, number>;
  canonicalDataHash?: string;
};

function findPlainSecrets(value: unknown, path = '$', found: string[] = []) {
  if (Array.isArray(value)) value.forEach((v, i) => findPlainSecrets(v, `${path}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = `${path}.${key}`;
      if (SENSITIVE_KEY.test(key) && child !== '[REDACTED]' && child !== '' && child != null) found.push(next);
      else findPlainSecrets(child, next, found);
    }
  }
  return found;
}

export function validateEnvelope(input: unknown): EnvelopeValidation {
  const errors: string[] = [], warnings: string[] = [], counts: Record<string, number> = {};
  const env = input as Partial<MigrationEnvelope>;
  if (!env || typeof env !== 'object') return { ok: false, errors: ['Envelope inválido'], warnings, counts };
  if (env.format !== 'imperio-central-migration') errors.push('Formato incompatível');
  if (Number(env.contractVersion) !== V94_CONTRACT_VERSION) errors.push('contractVersion incompatível');
  if (Number(env.schemaVersion) < SUPPORTED_MIN_SCHEMA) errors.push(`schemaVersion mínimo é ${SUPPORTED_MIN_SCHEMA}`);
  if (!env.instanceId || typeof env.instanceId !== 'string') errors.push('instanceId ausente');
  if (!Number.isInteger(Number(env.revision)) || Number(env.revision) < 0) errors.push('revision inválida');
  if (env.sensitiveIncluded === true) errors.push('Envelope com sensitiveIncluded=true é proibido');
  if (env.sourceKind && !['INSTANCE_EXPORT','CANONICAL_RECONCILED'].includes(env.sourceKind)) errors.push('sourceKind inválido');
  if (env.sourceKind === 'CANONICAL_RECONCILED' && !env.reconciliationId) errors.push('reconciliationId obrigatório para snapshot canônico');
  if (!env.data || typeof env.data !== 'object' || Array.isArray(env.data)) errors.push('data ausente/inválido');
  const canonicalDataHash=env.data ? payloadHash(env.data) : undefined;
  if (env.data && !payloadHashMatches(String(env.dataHash||''), env.data)) errors.push('Hash do envelope divergente');
  else if (env.data && String(env.dataHash||'').startsWith('fnv1a32:')) warnings.push('Envelope usa hash legado FNV-1a; SHA-256 será usado internamente');
  const secretPaths = env.data ? findPlainSecrets(env.data) : [];
  if (secretPaths.length) errors.push(`Segredos em claro detectados: ${secretPaths.slice(0, 5).join(', ')}`);
  if (env.data && typeof env.data === 'object') {
    const data = env.data as Record<string, unknown>;
    const units = new Set((Array.isArray(data.units) ? data.units : []).map((x: any) => String(x?.id || '')).filter(Boolean));
    for (const [collection, contract] of Object.entries(ENTITY_CONTRACTS)) {
      const rows = Array.isArray(data[collection]) ? data[collection] as any[] : [];
      counts[collection] = rows.length;
      const ids = new Set<string>();
      rows.forEach((row, index) => {
        const id = String(row?.[contract.idField] || '').trim();
        if (!id) errors.push(`${collection}[${index}] sem ${contract.idField}`);
        else if (ids.has(id)) errors.push(`${collection} possui ID duplicado: ${id}`);
        else ids.add(id);
        if (contract.unitRequired && contract.unitField) {
          const unitValue = row?.[contract.unitField];
          const refs = Array.isArray(unitValue) ? unitValue : [unitValue];
          for (const ref of refs) if (!ref || !units.has(String(ref))) errors.push(`${collection}[${index}] referencia unidade inválida: ${String(ref || '')}`);
        }
      });
    }
    const categoryIds = new Set((Array.isArray(data.categories) ? data.categories : []).map((x: any) => String(x?.id || '')).filter(Boolean));
    const clientIds = new Set((Array.isArray(data.clients) ? data.clients : []).map((x: any) => String(x?.id || '')).filter(Boolean));
    const productIds = new Set((Array.isArray(data.stockProducts) ? data.stockProducts : []).map((x: any) => String(x?.id || '')).filter(Boolean));
    const proIds = new Set((Array.isArray(data.pros) ? data.pros : []).map((x: any) => String(x?.id || '')).filter(Boolean));
    for (const [i, service] of (Array.isArray(data.services) ? data.services : []).entries()) if ((service as any)?.category && !categoryIds.has(String((service as any).category))) errors.push(`services[${i}] referencia categoria inválida: ${String((service as any).category)}`);
    for (const [i, pro] of (Array.isArray(data.pros) ? data.pros : []).entries()) for (const unitId of (Array.isArray((pro as any)?.units) ? (pro as any).units : [])) if (!units.has(String(unitId))) errors.push(`pros[${i}] referencia unidade inválida: ${String(unitId)}`);
    for (const [i, client] of (Array.isArray(data.clients) ? data.clients : []).entries()) if ((client as any)?.registrationUnit && !units.has(String((client as any).registrationUnit))) errors.push(`clients[${i}] referencia unidade de cadastro inválida: ${String((client as any).registrationUnit)}`);
    for (const [i, booking] of (Array.isArray(data.bookings) ? data.bookings : []).entries()) {
      const b=booking as any;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b?.date||''))) errors.push(`bookings[${i}] sem date válida YYYY-MM-DD`);
      if (b?.clientId && !clientIds.has(String(b.clientId))) errors.push(`bookings[${i}] referencia cliente inválido: ${String(b.clientId)}`);
    }
    for (const [i, row] of (Array.isArray((data as any).openingCommands) ? (data as any).openingCommands : []).entries()) {
      const r=row as any;if(!/^\d{4}-\d{2}-\d{2}$/.test(String(r?.serviceDate||''))) errors.push(`openingCommands[${i}] serviceDate inválida`);
      if(r?.clientId&&!clientIds.has(String(r.clientId))) errors.push(`openingCommands[${i}] referencia cliente inválido: ${String(r.clientId)}`);
    }
    for (const [i,row] of (Array.isArray((data as any).openingClientCredits)?(data as any).openingClientCredits:[]).entries()) if((row as any)?.clientId&&!clientIds.has(String((row as any).clientId))) errors.push(`openingClientCredits[${i}] referencia cliente inválido`);
    for (const [i,row] of (Array.isArray((data as any).openingClientPackages)?(data as any).openingClientPackages:[]).entries()) if((row as any)?.clientId&&!clientIds.has(String((row as any).clientId))) errors.push(`openingClientPackages[${i}] referencia cliente inválido`);
    for (const [i,row] of (Array.isArray((data as any).openingReceivables)?(data as any).openingReceivables:[]).entries()) {const r=row as any;if(r.clientId&&!clientIds.has(String(r.clientId))) errors.push(`openingReceivables[${i}] referencia cliente inválido`);if(r.unitId&&!units.has(String(r.unitId))) errors.push(`openingReceivables[${i}] referencia unidade inválida`);}
    for (const [i,row] of (Array.isArray((data as any).openingStockBalances)?(data as any).openingStockBalances:[]).entries()) {const r=row as any;if(r.productId&&!productIds.has(String(r.productId))) errors.push(`openingStockBalances[${i}] referencia produto inválido`);}
    for (const [i,row] of (Array.isArray((data as any).openingProfessionalPayables)?(data as any).openingProfessionalPayables:[]).entries()) {const r=row as any;if(r.professionalId&&!proIds.has(String(r.professionalId))) errors.push(`openingProfessionalPayables[${i}] referencia profissional inválido`);if(r.unitId&&!units.has(String(r.unitId))) errors.push(`openingProfessionalPayables[${i}] referencia unidade inválida`);}
    const blockers=(data as any)?.cutoverManifest?.blockers;
    if(Array.isArray(blockers)&&blockers.length) errors.push(`cutoverManifest possui ${blockers.length} bloqueador(es) não resolvido(s)`);
    const usernames = new Set<string>();
    for (const [i, user] of (Array.isArray(data.userAccounts) ? data.userAccounts : []).entries()) {
      const username = String((user as any)?.username || (user as any)?.email || '').trim();
      if (!username) errors.push(`userAccounts[${i}] sem username/email para migração`); else if (usernames.has(username)) errors.push(`userAccounts possui username duplicado: ${username}`); else usernames.add(username);
      for (const unitId of (Array.isArray((user as any)?.unitIds) ? (user as any).unitIds : [])) if (!units.has(String(unitId))) errors.push(`userAccounts[${i}] referencia unidade inválida: ${String(unitId)}`);
    }
    if (!Array.isArray(data.auditEvents)) warnings.push('auditEvents ausente: importar somente após confirmar trilha legada');
  }
  return { ok: errors.length === 0, errors, warnings, counts, canonicalDataHash };
}

export function assertValidEnvelope(input: unknown) {
  const result = validateEnvelope(input);
  if (!result.ok) throw new BadRequestException({ message: 'Envelope inválido', ...result });
  return result;
}

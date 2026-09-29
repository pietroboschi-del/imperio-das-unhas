import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENTITY_CONTRACTS } from '../migration/contracts';
import { payloadHash } from '../migration/hash';

export type ShadowProbe = {
  instanceId: string;
  revision: number;
  schemaVersion: number;
  dataHash: string;
  counts: Record<string, number>;
  collectionFingerprints: Record<string, string>;
};

function aggregatePairs(pairs: Array<{ id: string; hash: string }>) {
  const normalized = pairs
    .map(x => [String(x.id), String(x.hash)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return payloadHash(normalized);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, stableValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}
function stablePayloadHash(value: unknown) { return payloadHash(stableValue(value)); }

@Injectable()
export class ShadowService {
  constructor(private readonly prisma: PrismaService) {}

  enabled() { return String(process.env.SHADOW_READS_ENABLED || 'false') === 'true'; }

  assertEnabled() {
    if (!this.enabled()) throw new ForbiddenException('Leitura em sombra desabilitada no ambiente');
  }

  async status() {
    const latest = await this.prisma.migrationEnvelope.findFirst({
      where: { status: ImportStatus.IMPORTED },
      orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, instanceId: true, revision: true, schemaVersion: true, dataHash: true, importedAt: true },
    });
    const [units, categories, services, professionals, clients, clientUnitLinks, bookings, users] = await Promise.all([
      this.prisma.unit.count(),
      this.prisma.serviceCategory.count(),
      this.prisma.service.count(),
      this.prisma.professional.count(),
      this.prisma.client.count(),
      this.prisma.clientUnitLink.count({ where: { active: true } }),
      this.prisma.booking.count(),
      this.prisma.user.count(),
    ]);
    return {
      release: 'V96',
      shadowReadsEnabled: this.enabled(),
      operationalWritesEnabled: String(process.env.OPERATIONAL_WRITES_ENABLED || 'false') === 'true',
      sourceOfTruth: 'local_gateway_until_cutover',
      latestImportedEnvelope: latest,
      normalizedCounts: { units, categories, services, professionals, clients, clientUnitLinks, bookings, users },
      clientIsolationPolicy: 'derived_unit_presence',
    };
  }

  validateProbe(input: unknown): ShadowProbe {
    const p = input as Partial<ShadowProbe>;
    if (!p || typeof p !== 'object') throw new BadRequestException('Probe inválido');
    if (!p.instanceId || typeof p.instanceId !== 'string') throw new BadRequestException('instanceId ausente');
    if (!Number.isFinite(Number(p.revision)) || Number(p.revision) < 0) throw new BadRequestException('revision inválida');
    if (!Number.isFinite(Number(p.schemaVersion)) || Number(p.schemaVersion) < 94) throw new BadRequestException('schemaVersion inválido');
    if (!p.dataHash || typeof p.dataHash !== 'string') throw new BadRequestException('dataHash ausente');
    if (!p.counts || typeof p.counts !== 'object') throw new BadRequestException('counts ausente');
    if (!p.collectionFingerprints || typeof p.collectionFingerprints !== 'object') throw new BadRequestException('collectionFingerprints ausente');
    const allowed = new Set(Object.keys(ENTITY_CONTRACTS));
    const maxCollections = Math.max(1, Number(process.env.SHADOW_COMPARE_MAX_COLLECTIONS || 64));
    const keys = Object.keys(p.collectionFingerprints);
    if (keys.length > maxCollections) throw new BadRequestException('Probe excede o limite de coleções');
    for (const key of keys) if (!allowed.has(key)) throw new BadRequestException(`Coleção não suportada no probe: ${key}`);
    return {
      instanceId: p.instanceId,
      revision: Number(p.revision),
      schemaVersion: Number(p.schemaVersion),
      dataHash: p.dataHash,
      counts: Object.fromEntries(Object.entries(p.counts).map(([k, v]) => [k, Number(v || 0)])),
      collectionFingerprints: Object.fromEntries(Object.entries(p.collectionFingerprints).map(([k, v]) => [k, String(v)])),
    };
  }

  async compare(input: unknown) {
    this.assertEnabled();
    const probe = this.validateProbe(input);
    const exact = await this.prisma.migrationEnvelope.findFirst({
      where: {
        instanceId: probe.instanceId,
        revision: probe.revision,
        dataHash: probe.dataHash,
        status: ImportStatus.IMPORTED,
      },
      select: { id: true, instanceId: true, revision: true, schemaVersion: true, dataHash: true, importedAt: true },
    });
    const latest = exact || await this.prisma.migrationEnvelope.findFirst({
      where: { instanceId: probe.instanceId, status: ImportStatus.IMPORTED },
      orderBy: [{ revision: 'desc' }, { importedAt: 'desc' }],
      select: { id: true, instanceId: true, revision: true, schemaVersion: true, dataHash: true, importedAt: true },
    });
    if (!latest) {
      return {
        ok: true,
        exactEnvelopeImported: false,
        eligibleForShadowRead: false,
        reason: 'Nenhum envelope importado para esta instância',
        source: { instanceId: probe.instanceId, revision: probe.revision, schemaVersion: probe.schemaVersion, dataHash: probe.dataHash },
        backend: null,
        collections: {},
      };
    }
    const staged = await this.prisma.migrationEntity.findMany({
      where: { envelopeId: latest.id },
      select: { sourceCollection: true, sourceId: true, payloadHash: true },
    });
    const byCollection = new Map<string, Array<{ id: string; hash: string }>>();
    for (const row of staged) {
      if (!byCollection.has(row.sourceCollection)) byCollection.set(row.sourceCollection, []);
      byCollection.get(row.sourceCollection)!.push({ id: row.sourceId, hash: row.payloadHash });
    }
    const collections: Record<string, unknown> = {};
    let allMatch = Boolean(exact);
    for (const key of Object.keys(ENTITY_CONTRACTS)) {
      const rows = byCollection.get(key) || [];
      const backendCount = rows.length;
      const backendFingerprint = aggregatePairs(rows);
      const localCount = Number(probe.counts[key] || 0);
      const localFingerprint = String(probe.collectionFingerprints[key] || aggregatePairs([]));
      const countMatch = backendCount === localCount;
      const fingerprintMatch = backendFingerprint === localFingerprint;
      if (!countMatch || !fingerprintMatch) allMatch = false;
      collections[key] = { localCount, backendCount, countMatch, fingerprintMatch, localFingerprint, backendFingerprint };
    }
    return {
      ok: true,
      exactEnvelopeImported: Boolean(exact),
      eligibleForShadowRead: Boolean(exact) && allMatch,
      source: { instanceId: probe.instanceId, revision: probe.revision, schemaVersion: probe.schemaVersion, dataHash: probe.dataHash },
      backend: latest,
      collections,
      allCollectionsMatch: allMatch,
    };
  }

  async unitManifest(unitId: string, date?: string) {
    this.assertEnabled();
    const bookingWhere: Prisma.BookingWhereInput = { unitId };
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date deve estar em YYYY-MM-DD');
      bookingWhere.serviceDate = new Date(`${date}T00:00:00.000Z`);
    }
    const [unit, categories, services, professionals, clients, bookings] = await Promise.all([
      this.prisma.unit.findUnique({ where: { id: unitId } }),
      this.prisma.serviceCategory.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.service.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.professional.findMany({
        where: { units: { some: { unitId, active: true } } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.client.findMany({
        where: { unitLinks: { some: { unitId, active: true } } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.booking.findMany({ where: bookingWhere, orderBy: { id: 'asc' } }),
    ]);
    const rows = {
      units: unit ? [unit.legacyPayload || { id: unit.id, name: unit.name, active: unit.active }] : [],
      categories: categories.map(x => x.legacyPayload || { id: x.id, name: x.name, active: x.active }),
      services: services.map(x => x.legacyPayload || { id: x.id, name: x.name, active: x.active }),
      pros: professionals.map(x => x.legacyPayload || { id: x.id, name: x.name, active: x.active }),
      clients: clients.map(x => x.legacyPayload || { id: x.id, name: x.name, phone: x.phone, email: x.email }),
      bookings: bookings.map(x => x.legacyPayload),
    } as Record<string, unknown[]>;
    const fingerprints = Object.fromEntries(Object.entries(rows).map(([key, list]) => [
      key,
      aggregatePairs(list.map((row: any, index) => ({ id: String(row?.id || `__index_${index}`), hash: stablePayloadHash(row) }))),
    ]));
    return {
      release: 'V96',
      unitId,
      date: date || null,
      counts: Object.fromEntries(Object.entries(rows).map(([key, list]) => [key, list.length])),
      fingerprints,
      generatedAt: new Date().toISOString(),
      source: 'postgresql_shadow',
      operationalWritesEnabled: String(process.env.OPERATIONAL_WRITES_ENABLED || 'false') === 'true',
    };
  }
}

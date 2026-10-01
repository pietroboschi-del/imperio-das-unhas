export const V94_CONTRACT_VERSION = 1;
export const SUPPORTED_MIN_SCHEMA = 94;
export const SENSITIVE_KEY = /password|senha|secret|token|api[_-]?key|private[_-]?key|credential/i;

export type EntityContract = {
  scope: 'network' | 'unit' | 'unit_set' | 'location';
  idField: string;
  unitField?: string;
  unitRequired?: boolean;
};

export const ENTITY_CONTRACTS: Record<string, EntityContract> = {
  units: { scope: 'network', idField: 'id', unitField: 'id' },
  categories: { scope: 'network', idField: 'id' },
  services: { scope: 'network', idField: 'id' },
  pros: { scope: 'network', idField: 'id', unitField: 'units' },
  clients: { scope: 'network', idField: 'id', unitField: 'registrationUnit' },
  bookings: { scope: 'unit', idField: 'id', unitField: 'unit', unitRequired: true },
  openingCommands: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  openingClientCredits: { scope: 'network', idField: 'id' },
  openingClientPackages: { scope: 'network', idField: 'id' },
  openingReceivables: { scope: 'unit', idField: 'id', unitField: 'unitId' },
  openingStockBalances: { scope: 'location', idField: 'id', unitField: 'locationId' },
  openingProfessionalPayables: { scope: 'unit', idField: 'id', unitField: 'unitId' },
  clientCommands: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  demoCashMovements: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  demoFinancialEntries: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  financialAccounts: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  companyEntities: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  stockProducts: { scope: 'network', idField: 'id' },
  stockMovements: { scope: 'location', idField: 'id', unitField: 'locationId' },
  auditEvents: { scope: 'network', idField: 'id', unitField: 'unitId' },
  waitlistRequests: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  waitlistOpportunities: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  fiscalDocuments: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  receptionBookingGoals: { scope: 'unit_set', idField: 'id', unitField: 'unitIds' },
  agendaFillSnapshots: { scope: 'unit', idField: 'id', unitField: 'unitId', unitRequired: true },
  userAccounts: { scope: 'network', idField: 'id' },
};
export type MigrationSourceKind = 'INSTANCE_EXPORT' | 'CANONICAL_RECONCILED' | 'CLIENTS_ONLY_BATCH';
export type MigrationEnvelope = {
  format: 'imperio-central-migration';
  contractVersion: number;
  schemaVersion: number;
  generatedAt?: string;
  instanceId: string;
  revision: number;
  sensitiveIncluded: boolean;
  secretPolicy?: string;
  dataHash: string;
  sourceKind?: MigrationSourceKind;
  reconciliationId?: string;
  data: Record<string, unknown>;
};

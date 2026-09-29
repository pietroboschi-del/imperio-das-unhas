# V87 — Funções e wrappers relevantes

## Funções novas centrais
- `migrate87()`
- `snapshotStates87()`
- `sourceFor87()`
- `createOpportunity87()`
- `reconcile87()`
- `markContact87()`
- `markDeclined87()`
- `markConverted87()`
- `syncLinkedBookings87()`
- `currentRecoveryValue87()`
- `metrics87()`
- `visibleHistory87()`
- `injectAgendaReports87()`

## Wrappers V87
- `v79SaveQueueRequest`
- `v79MarkQueueContacted`
- `v79DeclineQueue`
- `v79RemoveQueue`
- `v79OpenQueue`
- `v80BeginQueueBooking`
- `saveReservation`
- `saveExistingBooking`
- `agendaDrop`
- `saveBlockEdit`
- `deleteBlock`
- `saveBlockTime`
- `savePro`
- `togglePro`
- `saveService`
- `toggleService`
- `finishBooking`
- `v80ReevaluateWaitlistOpportunities`
- `renderReports`
- `renderAdmin`

Todos usam marcador `__v87Wrapped` para impedir dupla aplicação dentro do runtime.

## Funções canônicas preservadas
- disponibilidade/oportunidade: V80 + Agenda canônica (`availabilityPlacement`, `availabilityEligiblePros`, `availabilityClientCompatible`);
- fila: V79;
- capacidade física: V77 `evaluatePhysicalCapacity()`;
- métricas/preço comercial: V83;
- auditoria: V64.

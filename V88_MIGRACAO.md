# V88 — Migration

- Versão anterior: `schemaVersion = 87`.
- Versão atual: `schemaVersion = 88`.
- ID: `v88-agenda-fill-trend`.
- Idempotente: sim.
- Nova configuração: `agendaFillTrendSettings`.
- Coleção histórica utilizada: `agendaFillSnapshots`, criada prospectivamente na V87.1.

A migration não cria histórico retroativo. Snapshots legados compatíveis da V87.1 recebem somente metadados de metodologia quando aplicável; os valores históricos não são recalculados nem inventados.

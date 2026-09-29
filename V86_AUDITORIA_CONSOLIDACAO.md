# Auditoria V86 — Consolidação V80–V85

## Fonte de verdade
Entrada: `imperio_preview_v85_painel_desempenho_recepcao_CORRIGIDA.html`.
SHA-256 da fonte preservada: `440f2368bdde5c6161b4967d44abaf0b6dd64f57bed749ac7058a6cab8ac2ef2`.

## Inventário estrutural final
- schemaVersion efetivo após migrations: **86**.
- Blocos JavaScript: **49**.
- Blocos CSS: **44**; nenhum bloco CSS inteiro duplicado e nenhum seletor V80–V85 repetido em blocos diferentes.
- IDs HTML estáticos: **17**, duplicados: **0**.
- `DOMContentLoaded`: **0**.
- `addEventListener`: **1** no código histórico; **0** adicionados por V80–V86.
- Scripts 1–42 (até V79): preservados byte a byte.
- Scripts alterados no saneamento: 43/V80, 44/V81, 45/V82, 48/V85. Novo: 49/V86.

## Problemas comprovados e correções
| Gravidade | Origem | Problema | Correção |
|---|---|---|---|
| Alta | V80 | Claims da Fila protegiam profissional, mas não incompatibilidades entre novas oportunidades da mesma cliente. | `compute()` passou a usar `availabilityClientCompatible()` entre claims da mesma cliente/unidade/data. |
| Média | V80 | Eventos legítimos podiam deixar oportunidades obsoletas até outra ação. | Reavaliação adicionada a booking público, profissional, serviço e estação. |
| Média | V81 | Escala válida com serviço elegível, mas duração impossível, podia não ser considerada cheia. | `dayModel()` diferencia combinação elegível de placement real. |
| Alta | V82 | Migration usava `db.migrations` e regravava em toda carga. | `migrationHistory` canônico + reconciliação não destrutiva de legado. |
| Média | V85 | Cálculo paralelo de métricas de recepção. | `metric85()` delega à fonte V83. |

## Mapa de runtime crítico
### Agenda / booking
`saveReservation` prevalente é a cadeia:
1. core;
2. V72 validação central;
3. V76 autoria/origem;
4. V78 invalidação/alerta de capacidade;
5. V79 vinculação de waitlist somente depois de booking real;
6. V80 reavaliação de oportunidades;
7. V81 invalidação de Agenda cheia.

`saveExistingBooking` mantém core + congelamentos/auditoria/validação e, depois, V80/V81 reavaliações.
`agendaDrop` mantém validação/auditoria e, depois, V80/V81 reavaliações.
`finishBooking` público passa por V76 autoria e V80 reavaliação.

### Disponibilidade
Definições canônicas permanecem no core:
- `availabilityServiceDuration()`;
- `availabilityEligiblePros()`;
- `availabilityWorkWindow()`;
- `availabilityPlacement()`;
- `availabilityClientCompatible()`.

V80 e V81 reutilizam essas funções; não existe segundo motor de agendamento.

### Capacidade física
Canônica: **V77 `evaluatePhysicalCapacity()`**, uma única definição, com matching bipartido/compatibilidade real. V78 gera alertas; V80 consulta advisory. Capacidade não bloqueia criar/editar/reagendar/encaixar.

### Relatórios de recepção
- **V83**: `allRows()` + `metrics()` = fatos/métricas canônicos.
- **V84**: `goalRows84()`/`goalMetrics84()` aplicam metas consumindo V83.
- **V85**: filtros/apresentação; `metric85()` delega a V83.

## Migrations V80–V86
- V80 `v80-waitlist-opportunity-engine`
- V81 `v81-agenda-full-alert`
- V82 `v82-historical-fill-demand-trend`
- V83 `v83-booking-author-performance-audit`
- V84 `v84-reception-booking-goals`
- V85 `v85-reception-performance-dashboard`
- V86 `v86-consolidation-sanitation-v80-v85`

Todas foram validadas em cadeia e reabertura. O código histórico contém duas declarações de `v60-reports-finance-dre`; ambas usam o mesmo ID/guard e o runtime mantém um único registro. A referência V82 dentro da migration V86 é somente reconciliação de marcador legado, não uma segunda migration V82.

## Persistência V80–V85
- V80: nenhuma coleção nova; persiste estado da oportunidade no `waitlistRequests` da V79.
- V81: nenhuma coleção de negócio nova; alerta derivado.
- V82: nenhuma coleção de negócio nova. `db.migrations` era uma fonte paralela acidental e deixou de ser escrita; eventual legado é preservado e reconciliado.
- V83: nenhuma coleção nova.
- V84: `receptionBookingGoals` — única coleção nova V80–V85.
  - PK: `id`.
  - referência: `receptionUserId`, `unitIds`.
  - snapshots: nome da recepcionista/unidades, alvos e período.
  - autoria/timestamps: `createdAt/By`, `updatedAt/By`, arquivamento e versão.
  - multiunidade: explícita por `unitIds`.
  - exclusão: arquivamento, não deleção física.
- V85: nenhuma coleção nova.

## Regras de negócio confirmadas
- Fila = intenção; não ocupa Agenda, profissional ou estação e não gera fatos financeiros.
- ANY/PREFERRED/REQUIRED preservados; PREFERRED não virou REQUIRED.
- IDEAL/ALTERNATIVA preservados.
- Oportunidade não cria booking; clique Agendar revalida e usa fluxo normal.
- Capacidade física continua gerencial e não bloqueante.
- Agenda cheia usa placement real, não contagem bruta.
- V82 é histórico/demanda observada; não é previsão.
- Autoria original não é transferida por reagendamento.
- Booking público não vira produção de recepcionista.
- Um booking com 3 serviços = 1 booking, 1 cliente, 3 serviços.
- Valor comercial agendado ≠ receita/caixa/DRE/comissão.
- Meta ≠ fato financeiro.
- Nenhum ranking/score foi criado.

## UI/DOM
- Não há código V81 ou posterior dentro do template/função de recibo de comissão.
- Não há `<script>` literal aninhado dentro dos 49 blocos JS.
- Conteúdo estático visível não contém tokens típicos de JS vazado.
- `v85Performance`, `v83BookingAudit` e o bloco V82 aparecem uma vez em seus templates.
- V85 é prependido diretamente ao retorno canônico de Relatórios → Agenda, sem depender de chamada manual.

## Testes
### Antes da correção
110 arquivos históricos executados: 7 pass / 103 interrupções por expectativas estruturais versionadas (principalmente número literal de scripts). O log completo foi preservado. Esses arquivos não foram modificados.

### Regressão atual V86
30/30 suítes, **1.475/1.475 assertions**. Inclui:
- Financeiro/DRE forte;
- Marketing;
- Usuários/Configurações;
- Auditoria;
- Visão Executiva;
- Notificações/Tarefas;
- Permissões/multiunidade;
- Fiscal/NFS-e;
- Agenda;
- Campos e Opções;
- combo/rateio;
- autoria;
- estações/capacidade/alertas;
- Fila V79;
- Motor V80 + adversarial;
- Histórico V82;
- métricas V83;
- metas V84;
- painel V85;
- migration chain/reopen;
- UI/DOM;
- neutralidade financeira e deduplicação de notificações.

Gateway fiscal: **3/3**.

## Antes/depois de cenários de saneamento
- mesma cliente + duas oportunidades incompatíveis: **2 → 1**.
- booking público e reavaliação: **não disparava → dispara**.
- escala 20 min + serviço 30 min sem placement: **full=false → full=true**.
- migration V82 segunda carga: **gravava novamente → no-op**.
- V85: **cálculo paralelo → delegação V83**.

## Limitação
Não houve E2E completo em navegador real. Chromium headless não concluiu no ambiente; não foi usado como evidência de aprovação. DOM simulado + runtime Node/vm + inspeção estrutural foram usados.

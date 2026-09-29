# V87 — Auditoria, arquitetura e regras de rastreabilidade da Fila de Encaixe

## 1. Auditoria inicial da V86

Fonte de verdade utilizada: `V86 — Consolidação e Saneamento V80–V85`.

Verificações antes da implementação:

- `schemaVersion = 86` confirmado.
- 49 blocos `<script>` e 49 fechamentos confirmados.
- regressão V86 atual: **30/30 suítes**, **1.475/1.475 assertions**.
- `evaluatePhysicalCapacity()` continua com **uma única definição canônica**, originada da V77, usando matching real de estações e permanecendo **não bloqueante**.
- `__imperioV83.metrics()` continua sendo a fonte canônica de métricas da recepção; V84 aplica metas e V85 apresenta/consolida.
- V79 continua sendo a Fila operacional/intenção; V80 continua sendo o motor canônico de oportunidades e reutiliza o motor de disponibilidade da Agenda.
- wrappers críticos de `saveReservation`, `saveExistingBooking`, `agendaDrop` e `finishBooking` foram revistos no runtime.
- migrations V79–V86 permaneciam idempotentes na regressão de reabertura.
- nenhuma duplicidade estrutural crítica foi encontrada antes da V87.

### Regressão pré-existente encontrada durante a integração

A V82 possuía uma dependência lexical frágil de funções de relatório/capacidade definidas em outro IIFE. Em execução integrada, a tendência histórica podia ficar sem base de capacidade mesmo havendo escala válida. Isso foi tratado **antes da V87**, reutilizando a API canônica já exposta (`__imperioV62.agendaMetricsCanonical`) e fallback seguro para serviço/cliente. Não foi implementada tendência inteligente por lead time.

Dos 49 scripts existentes da V86, **48 permaneceram byte a byte inalterados**. O único script anterior ajustado foi o da V82 para corrigir essa regressão de integração. A V87 é o novo script 50.

## 2. Arquitetura escolhida

### Três fatos distintos

A V87 separa explicitamente:

1. **liberação/alteração de capacidade** — evento da Agenda;
2. **oportunidade de encaixe** — resultado do motor V80 para uma solicitação;
3. **recuperação** — oportunidade convertida em booking real.

Eles não são tratados como o mesmo fato.

### Nova coleção: `db.waitlistOpportunities`

Foi criada uma coleção própria porque `waitlistRequests` representa o estado atual de uma intenção e não consegue preservar corretamente múltiplas oportunidades históricas da mesma solicitação.

Exemplo preservado:

- oportunidade 1: Ana, 15:00, recusada/invalida;
- oportunidade 2: Camila, 17:00, posteriormente convertida.

Ambas permanecem registradas.

A coleção de eventos de liberação **não foi duplicada**: a V87 reutiliza `auditEvents` da V64 quando existe um evento de Agenda correspondente e cria um evento de auditoria técnico somente quando necessário para rastreabilidade.

## 3. Tipos de origem

- `EXISTING_AVAILABILITY` — vaga já existia quando a solicitação foi reavaliada/criada.
- `CANCELLATION` — cancelamento real liberou a faixa relacionada à nova oportunidade.
- `RESCHEDULE` — reagendamento real liberou a faixa relacionada.
- `SERVICE_CHANGE` — redução/alteração de serviço ou configuração de serviço gerou disponibilidade compatível.
- `UNBLOCK` — remoção/redução de bloqueio liberou a faixa.
- `PROFESSIONAL_AVAILABILITY_CHANGE` — escala/habilitação/ativação de profissional passou a permitir a vaga.
- `OTHER_AVAILABILITY_CHANGE` — outra alteração real de disponibilidade rastreável.
- `UNKNOWN_LEGACY` — somente para oportunidade V80 que já estava ativa antes da V87 e cuja origem histórica não pode ser provada.

A origem não é atribuída apenas porque uma reavaliação ocorreu. Quando a origem é booking/bloqueio, a nova oportunidade precisa ter relação temporal/profissional com a faixa efetivamente liberada; caso contrário, a origem cai conservadoramente para `EXISTING_AVAILABILITY`.

## 4. Estados da oportunidade

A V87 não cria uma máquina de estados paralela à Fila. O histórico de oportunidade utiliza apenas:

- `FOUND`
- `CONTACTED`
- `CONVERTED`
- `DECLINED`
- `INVALIDATED`
- `EXPIRED`

O status canônico de `waitlistRequests` permanece preservado.

## 5. Regra exata de recuperação

Uma oportunidade só é considerada **convertida/recuperada** quando:

1. existe `waitlistRequest` ativo correspondente;
2. a oportunidade foi revalidada pelo fluxo V80;
3. o fluxo normal da Agenda salva um **booking real**;
4. a V79 efetivamente muda a solicitação para `BOOKED` e vincula `appointmentId`;
5. a V87 grava a cadeia `requestId → opportunityId → bookingId`.

Não contam como recuperação:

- oportunidade encontrada;
- cliente contatada;
- aceite verbal;
- formulário de agendamento apenas aberto;
- booking fantasma/inexistente.

### Cancelamento recuperado

Só é contabilizado conceitualmente como cancelamento recuperado quando a oportunidade convertida possui:

- `sourceType = CANCELLATION`;
- `sourceBookingId` real;
- `sourceEventId` rastreável;
- `bookingId` recuperador real.

Um booking originado da fila **não é automaticamente** um cancelamento recuperado.

## 6. Valor comercial recuperado

Na conversão é congelado `commercialValueAtConversion`, calculado a partir do booking real usando a regra comercial canônica da V83 (`applyCommercialPricing`).

Assim:

- Manicure 40 + Pedicure 40 + combo 65 ⇒ **valor comercial recuperado = 65**, não 80.
- o indicador **não** cria receita, caixa, DRE, recebível ou comissão.

O painel chama explicitamente o indicador de **Valor comercial recuperado**.

## 7. Booking posteriormente cancelado/falta

A V87 preserva o fato histórico de que a oportunidade foi convertida.

Se o booking recuperador depois for `Cancelado` ou `Faltou`:

- o registro continua `CONVERTED` como fato histórico;
- o status atual do booking é sincronizado;
- fica registrado que houve cancelamento posterior;
- o booking deixa de compor o **valor comercial recuperado atual**.

Isso evita apagar o histórico sem apresentar valor de uma recuperação que não permaneceu válida.

## 8. Invalidação

Se a vaga desaparecer antes do booking, a oportunidade recebe `INVALIDATED`, `invalidatedAt` e motivo. O registro não é apagado.

Se a janela simplesmente expirar, recebe `EXPIRED`.

Uma nova oportunidade posterior para o mesmo request cria **novo registro**, sem sobrescrever a anterior.

## 9. Multiunidade e capacidade física

- métricas/visualização respeitam `allowedUnits()`/permissões atuais;
- a unidade é armazenada no fato da oportunidade;
- capacidade física continua gerencial e não bloqueante;
- `physicalCapacityWarning` é preservado no histórico quando aplicável.

## 10. Local visual

A V87 adiciona um bloco compacto **Recuperação da Fila de Encaixe** em Relatórios → Agenda, com drill-down “Ver histórico”. A Agenda operacional não recebeu dashboard novo.

O detalhe permite verificar cliente, solicitação, serviço, horário, profissional, IDEAL/ALTERNATIVA, origem, status, contato, booking, valor comercial recuperado e atenção de capacidade.

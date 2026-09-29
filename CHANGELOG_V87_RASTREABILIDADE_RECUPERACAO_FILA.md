# CHANGELOG — V87 · Rastreabilidade e Recuperação da Fila de Encaixe

## Base
- Fonte: V86 — Consolidação e Saneamento V80–V85.
- Schema anterior: 86.
- Schema novo: 87.

## Correção prévia de regressão da base
- Corrigida integração da V82 com a capacidade canônica de Relatórios, eliminando dependência lexical entre IIFEs.
- Nenhuma tendência inteligente por lead time foi adicionada.

## Persistência
- Nova coleção: `waitlistOpportunities`.
- Migration: `v87-waitlist-opportunity-trace-recovery`.
- Migration idempotente, não destrutiva e sem backfill inventado.
- Oportunidade V80 já ativa na primeira abertura da V87 é registrada como `UNKNOWN_LEGACY`, preservando o fato observado sem inventar causa.

## Rastreabilidade
- Cadeia persistida: solicitação → oportunidade → booking.
- Quando conhecido: evento/liberação → oportunidade → booking.
- Origens: disponibilidade existente, cancelamento, reagendamento, alteração de serviço, desbloqueio, alteração de disponibilidade profissional e outras alterações de disponibilidade.
- Preservados autor da solicitação, contato e autor/origem do booking.

## Recuperação
- Recuperação somente após booking real e solicitação `BOOKED`.
- Oportunidade/contato não contam como recuperação.
- Cancelamento recuperado exige origem comprovada `CANCELLATION` + booking/evento de origem + booking recuperador.
- Nenhuma taxa percentual foi inventada nesta versão.

## Valor comercial
- `commercialValueAtConversion` usa a regra comercial canônica da V83.
- Combos respeitam o valor real do combo.
- Booking posteriormente cancelado/falta preserva conversão histórica, mas deixa de somar no valor comercial recuperado atual.
- Nenhum fato financeiro é criado.

## UI
- Bloco compacto em Relatórios → Agenda.
- Drill-down do histórico de oportunidades.
- Sem poluir a Agenda operacional.

## Preservação
- V79 permanece Fila canônica.
- V80 permanece motor canônico de oportunidades/disponibilidade.
- V77 permanece capacidade física canônica e não bloqueante.
- V83 permanece fonte canônica de preço/métricas da recepção.
- V86 é preservada separadamente no pacote.

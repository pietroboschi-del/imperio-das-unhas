# V88 — Tendência Inteligente de Preenchimento da Agenda

## Objetivo
Comparar o ritmo atual de preenchimento de uma agenda com o histórico real de agendas comparáveis no **mesmo lead time D-N**, sem confundir a comparação com ocupação final, meta comercial ou previsão de demanda.

## Implementado
- `schemaVersion` evolui de 87 para **88**.
- Migration idempotente: `v88-agenda-fill-trend`.
- Configuração central em `db.agendaFillTrendSettings`:
  - janela histórica: 180 dias;
  - até 8 amostras recentes;
  - mínimo de 4 amostras;
  - faixa de alinhamento: ±8 pontos percentuais.
- Comparabilidade por:
  - mesma unidade;
  - mesmo dia da semana da data-alvo;
  - mesmo lead time exato;
  - snapshot prospectivo compatível com a metodologia canônica;
  - janela histórica configurada.
- Referência calculada pela **mediana** das amostras comparáveis.
- Estados: `ahead`, `aligned`, `behind`, `insufficient_history`, `capacity_unavailable` e `past_date`.
- Painel e chip compactos na Agenda com explicação metodológica.
- Alertas gerenciais consultivos quando o ritmo está abaixo da referência, com deduplicação.
- Integração com o barramento interno da V87.1 para atualização após alterações materiais da Agenda.
- Neutralidade financeira preservada.
- Política histórica explícita: **prospectiva, mesmo lead time, sem backfill inventado**.

## Correção de regressão encontrada durante a V88
Foi corrigida uma classificação da rastreabilidade V87: alteração de status envolvendo `Faltou` podia ser interpretada como `RESCHEDULE` apenas porque a janela deixava de ocupar a Agenda. Agora esse caso é classificado como `OTHER_AVAILABILITY_CHANGE`; cancelamento real permanece `CANCELLATION` e reagendamento real permanece `RESCHEDULE`.

## Fora do escopo
- previsão/ML de ocupação futura;
- alteração de metas comerciais;
- WhatsApp ou automações externas;
- mudanças financeiras/DRE;
- redesign completo da Agenda;
- fabricação de histórico anterior à coleta real.

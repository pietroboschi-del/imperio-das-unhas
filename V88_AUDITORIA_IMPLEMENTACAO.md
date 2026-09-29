# V88 — Auditoria de implementação

## Fontes canônicas preservadas
- Ocupação/capacidade: `__imperioV62.agendaMetricsCanonical`.
- Snapshots D-N prospectivos: `__imperioV871` / `agendaFillSnapshots`.
- Alertas: integração compatível com `__imperioV66`.
- Fila/rastreabilidade: V79/V80/V87 preservadas.
- Capacidade física: V77 preservada e não confundida com tendência de preenchimento.

## Definição da tendência
Para uma data-alvo e unidade, a V88 calcula o lead time atual e busca snapshots passados da mesma unidade, mesmo weekday e mesmo lead time. A referência é a mediana das amostras válidas recentes.

Com menos de 4 amostras, o resultado é `histórico insuficiente`. A V88 é descritiva e não declara probabilidade futura de lotação.

## Mudança em código anterior
Somente o script da V87 foi corrigido no tratamento de status `Faltou`, além da inclusão do novo script V88. A V87.1 foi preservada e ganhou teste específico de compatibilidade.

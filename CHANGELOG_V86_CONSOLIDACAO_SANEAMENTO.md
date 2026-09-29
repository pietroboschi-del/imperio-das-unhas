# V86 — Consolidação e Saneamento V80–V85

## Escopo
Versão de consolidação. Nenhuma nova funcionalidade de negócio foi criada. A fonte de verdade de entrada foi a V85 — Painel de Desempenho da Recepção — CORRIGIDA.

## Correções comprovadas

### V80 — Motor de oportunidades da Fila
- A arbitragem passou a validar incompatibilidade entre oportunidades recém-atribuídas para a mesma cliente usando a função canônica `availabilityClientCompatible()`.
- Mantidas as regras ANY / PREFERRED / REQUIRED e IDEAL / ALTERNATIVA.
- Reavaliação orientada a eventos ampliada para alterações legítimas que afetam disponibilidade: booking público (`finishBooking`), profissionais (`savePro`/`togglePro`), serviços (`saveService`/`toggleService`) e estações (`v77SaveWorkstation`).
- Nenhum polling, booking automático ou reserva fantasma foi criado.
- Capacidade física continua somente consultiva.

### V81 — Agenda cheia
- Corrigido falso negativo quando existe escala e combinação elegível, porém a duração do serviço não cabe em nenhum intervalo real.
- Dia sem escala continua não sendo rotulado como cheio.
- Disponibilidade continua derivada do motor canônico da Agenda.

### V82 — Histórico / demanda observada
- Migration passou a usar `db.migrationHistory`, fonte canônica do projeto.
- Eventual marcador legado V82 em `db.migrations` é somente lido/reconciliado, sem criar nova fonte paralela e sem apagar dados.
- Reabertura torna-se idempotente, sem gravação desnecessária.
- Nomenclatura preserva “demanda observada”; não há previsão ou tendência por lead time nesta versão.

### V83 / V84 / V85 — Recepção
- V83 não foi reescrita e permanece fonte canônica dos fatos/métricas de recepção.
- V84 não foi reescrita; metas continuam consumindo V83.
- V85 deixou de recalcular as mesmas métricas e passou a delegar a `__imperioV83.metrics()`; fallback é apenas defensivo.
- Nenhum ranking, score ou nova fonte financeira foi criado.

### V86 — saneamento
- Migration `v86-consolidation-sanitation-v80-v85` adicionada, idempotente e não destrutiva.
- Reconciliador defensivo do marcador legado V82 para `migrationHistory`.
- Declaração técnica explícita das fontes canônicas: métricas de recepção = V83; capacidade física = V77.
- Nenhuma coleção de negócio nova.

## Preservação
- Blocos JavaScript 1–42 (até V79) permaneceram byte a byte iguais à V85 corrigida de entrada.
- V83 (script 46) e V84 (script 47) permaneceram byte a byte iguais.
- Alterações de código limitaram-se aos scripts V80, V81, V82 e V85, além do novo script V86.
- V85 corrigida original preservada como `V85_CORRIGIDA_FONTE_PRESERVADA.html`.

## Validação final
- 49/49 blocos JavaScript válidos.
- 49 `<script>` / 49 `</script>` balanceados.
- 17 IDs HTML estáticos / 0 duplicados.
- 0 vazamentos de texto JavaScript detectados no DOM estático.
- 30/30 suítes da regressão atual V86.
- 1.475/1.475 assertions.
- Gateway fiscal: 3/3.
- Migração V79→V86 + reabertura: sem duplicação.

## Limitação de validação
Não houve E2E completo em navegador real. A tentativa com Chromium headless não concluiu no ambiente. A validação de UI foi feita por inspeção estrutural, DOM simulado e runtime Node/vm.

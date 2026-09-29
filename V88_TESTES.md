# V88 — Testes

## Resultado final
- Regressão completa atual: **33/33 suítes**.
- Assertions: **1.627/1.627**.
- Falhas: **0**.
- Teste focal V88: **54 verificações**.
- Preservação V87.1 dentro da V88: **25 verificações**.
- Gateway fiscal: **3/3 testes**.
- Estrutura do HTML: **52 scripts / 52 fechamentos**.
- Sintaxe JavaScript: todos os 52 blocos passam `node --check`.

## Cobertura específica V88
Inclui migration/idempotência, janela de 180 dias, mínimo 4/máximo 8 amostras, mediana, limiar ±8 p.p., mesma unidade/dia da semana/lead time, exclusão de D-0 quando a leitura é D-7, uso do motor canônico de ocupação, histórico insuficiente, snapshots prospectivos idempotentes, neutralidade financeira, alertas consultivos/deduplicados e textos metodológicos.

## Cobertura de preservação V87.1
Inclui snapshots prospectivos, ausência de backfill, idempotência, barramento de eventos, emissão somente após mudança material, diagnóstico de IDs/referências, navegação móvel estrutural e neutralidade financeira.

## Observação visual
A validação automatizada de lógica e DOM está completa. A tentativa de screenshot em Chromium headless no ambiente de execução não concluiu por limitação do processo headless; isso não alterou os resultados das suítes. A abertura direta de `.html` local no iPhone continua não sendo equivalente a servir a aplicação por HTTP/HTTPS e não é considerada resolvida pela V88.

# Testes — V91

## Regressão funcional
- 36/36 suítes aprovadas
- 1.744 assertions aprovadas
- 0 falhas

## Suíte V91
`V91_TEST_UX_RESPONSIVE_FOUNDATION.js`: 29 verificações.

Valida, entre outros pontos:
- schemaVersion 91 e migration idempotente;
- ausência de impacto financeiro;
- ausência de mudança de regra de negócio;
- preservação V88/V90 e motor de capacidade;
- drawer móvel e redirecionamento do menu legado;
- modais responsivos;
- tabelas roláveis internamente;
- Agenda mobile com coluna de horário sticky e hint;
- foco visível e reduced motion;
- reabertura sem gravação adicional.

## Sintaxe
55/55 blocos JavaScript aprovados em `node --check`.

## Gateway Fiscal
3/3 testes aprovados.

## Navegador
Chromium headless em 1440x900, 820x1000 e 390x844: nenhum page error e nenhum overflow horizontal do documento nas principais páginas.

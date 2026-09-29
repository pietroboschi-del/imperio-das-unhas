# Testes — V90

## Suíte atual
Runner: `tests_v90_current/V90_RUN_CURRENT_REGRESSION.js`

Resultado final:
- 35 suítes funcionais
- 35 aprovadas
- 0 falhas
- 1.713 assertions

A suíte V90 específica (`V90_TEST_STRUCTURAL_CONFIGURABILITY_PHASE2.js`) possui 37 verificações.

## Gateway fiscal
- 3 testes
- 3 aprovados
- 0 falhas

## Sintaxe
- 54 blocos JavaScript extraídos do HTML
- 54 aprovados com `node --check`

## Política de execução
O runner atual ignora todos os arquivos `*_RUN_CURRENT_REGRESSION.js` como casos de teste, evitando recursão entre runners históricos.

# Testes — V94

## Regressão completa
- 39/39 suítes aprovadas.
- 1.898/1.898 assertions aprovadas.
- 0 falhas.

## V94 específico
- 61 verificações.
- Porta de persistência local.
- schema/migration/idempotência.
- instanceId e revisão.
- save no-op sem incremento de revisão.
- save real com incremento.
- rollback de revisão em falha simulada.
- contratos de entidades e API.
- RBAC/unidade previstos no contrato server-side.
- export sanitizado sem credenciais em claro.
- preservação de chave fiscal documental.
- hash e detecção de envelope adulterado.
- outbox explícita e deduplicação por idempotency key.
- push/pull automático desligados.
- neutralidade financeira.
- reabertura sem duplicar migration V94.

## Sintaxe
- 58/58 blocos JavaScript aprovados por `node --check`.

## Gateway fiscal
- 3/3 testes aprovados.

## Observação visual
A tentativa de validação automatizada com Chromium headless neste ambiente ficou bloqueada pelo runtime/DBus e atingiu timeout. A V94 não altera o layout operacional principal; adiciona apenas a tela de diagnóstico de Arquitetura em Configurações. A validação lógica/DOM está coberta pela regressão automatizada.

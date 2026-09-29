# V98c — Evidências de testes

## Gate de caracterização

Comando:

```bash
node tests_characterization/run-characterization-gate.mjs
```

Resultado esperado/congelado:

- 12 suítes críticas;
- 570 verificações críticas;
- regressão completa 42/42;
- 2.043 assertions completas;
- 22 testes adicionais de paridade backend/financeiro;
- zero falhas.

## Backend local disponível sem dependências externas

`npm test` no diretório `backend/` deve manter os contratos V95–V98b e os projetores V98a verdes.

## Gateway fiscal

`node fiscal-gateway/test/gateway.test.mjs`: 3/3.

## Limitação conhecida

O runtime completo NestJS + Prisma + PostgreSQL continua não homologado neste host, pois o ambiente local não possui acesso npm/PostgreSQL. O workflow GitHub Actions permanece preparado para executar esse gate assim que o repositório aceitar escrita pela integração.

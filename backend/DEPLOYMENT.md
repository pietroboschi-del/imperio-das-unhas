# Deploy do backend — corte controlado do Centro

Este diretório contém o backend central NestJS/PostgreSQL. O primeiro ambiente operacional deve iniciar com escrita limitada à unidade `centro`.

## Build

Use `backend/` como contexto do container:

```bash
docker build -t imperio-backend .
```

O container executa `prisma migrate deploy` antes de iniciar `dist/src/main.js`.

## Variáveis mínimas

Parta de `.env.production.example`. Nunca versione credenciais reais.

Obrigatórias para o ambiente:
- `DATABASE_URL`: PostgreSQL gerenciado.
- `CORS_ORIGINS`: origem HTTPS exata do frontend.
- `COOKIE_SECURE=true`.
- `OPERATIONAL_WRITES_ENABLED=true`.
- `OPERATIONAL_WRITES_UNITS=centro` durante o primeiro corte.

Mantenha `MIGRATION_IMPORT_ENABLED=false` e `OPENAPI_ENABLED=false` em operação normal.

## Ativação

1. Suba PostgreSQL e backend com writes inicialmente desligados, se ainda houver importação/reconciliação real a executar.
2. Confirme `GET /api/v1/health`.
3. Execute as migrations.
4. Crie o administrador por comando one-off usando `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_NAME`; remova esses segredos do ambiente após a criação.
5. Reconcile/import os dados reais e confira o estado vigente do Centro.
6. Ative `OPERATIONAL_WRITES_ENABLED=true` com `OPERATIONAL_WRITES_UNITS=centro`.
7. Confirme no health que `operationalWriteUnits` contém somente `centro`.
8. Só amplie a allowlist depois da validação operacional da unidade anterior.

O frontend não deve usar fallback de escrita legado quando o modo central estiver ativo.

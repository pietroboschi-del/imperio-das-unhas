# Deploy do backend — operação oficial das três unidades

Este diretório contém o backend central NestJS/PostgreSQL. O estado operacional atual autoriza escrita nas três unidades canônicas: `centro`, `big` e `shopping-contagem`.

## Release oficial fixada

A fonte de verdade da release está em `OFFICIAL_RELEASE.json`.

Regras obrigatórias:
- deploy somente pelo **SHA exato do commit de release**; não usar `main` nem uma branch flutuante como referência de produção;
- baseline funcional validada: `ec56984e190a7b3cb4cdee4d79369853b2f25621`;
- CI validada: workflow `V98 Backend CI`, run `36866440047`, conclusão `success`;
- o plano inicial restringia escrita ao `centro`;
- em 2026-10-03 houve autorização explícita do proprietário para liberar `centro`, `big` e `shopping-contagem` para escrita operacional;
- profissionais sem escala/horários configurados não geram disponibilidade de agendamento, mesmo com a unidade operacionalmente habilitada.

O commit que contém `OFFICIAL_RELEASE.json` passa a ser o SHA da release oficial deste bloco.

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
- `SCHEMA_MIGRATION_ENABLED=false` até backup manual/PITR estar confirmado.
- `CORS_ORIGINS`: origem HTTPS exata do frontend.
- `COOKIE_SECURE=true`.
- `OPERATIONAL_WRITES_ENABLED=true`.
- `OPERATIONAL_WRITES_UNITS=centro,big,shopping-contagem` no estado operacional atual.

Mantenha `MIGRATION_IMPORT_ENABLED=false` e `OPENAPI_ENABLED=false` em operação normal.

## Ativação

1. Suba PostgreSQL e backend com `SCHEMA_MIGRATION_ENABLED=false` enquanto não existir artefato de recuperação verificado.
2. Confirme `GET /api/v1/health`.
3. Depois de confirmar backup lógico, backup de volume ou PITR, faça um deployment controlado com `SCHEMA_MIGRATION_ENABLED=true` para aplicar `prisma migrate deploy`; valide o resultado e retorne a variável para `false`.
4. Crie o administrador por comando one-off usando `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_NAME`; remova esses segredos do ambiente após a criação.
5. Reconcile/import os dados reais e confira o estado vigente das unidades.
6. Ative `OPERATIONAL_WRITES_ENABLED=true` com `OPERATIONAL_WRITES_UNITS=centro,big,shopping-contagem`.
7. Confirme no health que `operationalWriteUnits` contém as três unidades canônicas.
8. Mantenha os gates de migração/importação fechados durante a operação normal.

O frontend não deve usar fallback de escrita legado quando o modo central estiver ativo.


## Proteção de dados

O runbook de recuperação está em `PRODUCTION_RECOVERY.md`. No plano atual não há backup automático Railway nem PITR confirmados. Para a migração atual existe um backup lógico `pg_dump` confirmado; ele deve ser validado com `pg_restore --list` e qualquer ensaio de restauração deve ocorrer primeiro em PostgreSQL 18 separado. Nenhuma restauração destrutiva deve ser feita no banco de produção apenas para teste.


## Cookie de sessão entre frontend e backend

Em produção, frontend e backend podem estar em hosts distintos. Para que o navegador envie `imperio_session` nas chamadas autenticadas feitas pelo frontend ao backend, use:

```env
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

O backend aplica `SameSite=None` por padrão quando `COOKIE_SECURE=true`. Em ambientes HTTP locais com `COOKIE_SECURE=false`, o fallback é `SameSite=Lax`, pois navegadores rejeitam `SameSite=None` sem `Secure`.

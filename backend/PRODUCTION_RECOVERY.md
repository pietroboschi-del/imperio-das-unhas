# PostgreSQL de produção — backup e rollback

## Estado confirmado

Ambiente: `production` no projeto Railway `imperio-das-unhas`.

Banco definitivo:
- serviço: `Postgres`;
- volume: `postgres-volume`;
- mount: `/var/lib/postgresql/data`;
- imagem: PostgreSQL 18 Railway;
- deployment observado: `853e47f7-120a-46c7-99e2-d53a13a3d301`;
- status: `SUCCESS`.

Em 2026-10-02 a aba Backups do Railway mostrou `No Backups`. No plano atual, criação de backup de volume e PITR exige Pro. Portanto:

- não há agenda automática de backups Railway confirmada;
- não há PITR habilitado;
- não existe recuperação point-in-time disponível.

## Proteção gratuita confirmada para a migração atual

Foi gerado um backup lógico completo via `pg_dump` PostgreSQL 18, formato custom:

`imperio-postgres-2026-10-02T20-06-42-410Z.dump`

Evidência:
- download concluído no navegador;
- tamanho aproximado observado: 1,7 MB;
- backend respondeu HTTP 200 em `2026-10-02T20:06:36Z`;
- SHA da aplicação que gerou o backup: `ec9009bb074fa52dea9f9352b3b1f9f1e1111fa6`.

Para esta migração:

`PROTECTED_BY_CONFIRMED_LOGICAL_BACKUP_2026_10_02`

Esse dump é um ponto de recuperação fixo. Ele não contém alterações realizadas depois de sua geração.

## Migration de schema validada

A execução controlada de `prisma migrate deploy` encontrou:

- 12 migrations;
- `No pending migrations to apply.`.

Depois da validação:
- `SCHEMA_MIGRATION_ENABLED=false`;
- `MIGRATION_IMPORT_ENABLED=false`;
- `CLIENT_BATCH_COMMIT_ENABLED=false`;
- `OPERATIONAL_WRITES_UNITS=centro,big,shopping-contagem`.

## Regra antes de importar dados reais

NÃO iniciar promoção/importação real sem:

1. manter o arquivo `.dump` preservado fora do Railway;
2. validar o arquivo com `pg_restore --list`;
3. manter `MIGRATION_IMPORT_ENABLED=false` até o bloco explicitamente autorizado;
4. manter `CLIENT_BATCH_COMMIT_ENABLED=false` até aprovação do batch/reportHash;
5. manter escrita operacional restrita às unidades explicitamente autorizadas;
6. possuir SHA exato de aplicação para rollback.

Não versionar credenciais ou `DATABASE_URL`.

## Validação do dump

A validação é somente leitura:

```bash
pg_restore --list imperio-postgres-2026-10-02T20-06-42-410Z.dump
```

Se o comando falhar, considerar o arquivo inválido e gerar um novo backup antes de continuar.

## Rollback

### Código

Rollback de aplicação deve usar SHA exato. Nunca usar `main` ou branch flutuante.

- SHA atual validado: `ec9009bb074fa52dea9f9352b3b1f9f1e1111fa6`;
- SHA anterior validado: `63a1c36ad9a1c8ad4f0b0550a7e74258537bb133`.

### Dados

Se uma futura importação falhar:

1. interromper novas escritas;
2. guardar logs/reportHash/relatório da falha;
3. validar o dump com `pg_restore --list`;
4. criar um PostgreSQL 18 separado;
5. restaurar o dump no banco separado;
6. validar schema, contagens e dados críticos;
7. somente então decidir entre recuperação seletiva ou troca controlada do banco.

Exemplo em banco separado:

```bash
createdb imperio_restore_check
pg_restore \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --dbname imperio_restore_check \
  imperio-postgres-2026-10-02T20-06-42-410Z.dump
```

NÃO usar `--clean` contra produção como primeira ação e não executar restauração destrutiva apenas como teste.

## Limitação sem PITR

Uma restauração integral desse dump retorna ao estado das 20:06 UTC de 2026-10-02. Dados gravados depois desse instante não estão nele.

Antes de cada mudança estrutural ou importação relevante, gere novo backup lógico e preserve uma cópia fora do computador operacional.

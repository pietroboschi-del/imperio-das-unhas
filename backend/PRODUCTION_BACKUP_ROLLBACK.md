# Produção — backup e rollback

Este runbook pertence à release oficial das três unidades. Ele não autoriza importação, promoção de batch ou liberação operacional por si só.

## Estado confirmado em 2026-10-02

- Projeto Railway: `imperio-das-unhas`
- Ambiente: `production`
- Postgres: `e051bb64-079a-4718-a113-80fe38ddb016`
- Volume: `fe0fe9f6-5883-444e-aa2e-e86b095682e7`
- Imagem: `ghcr.io/railwayapp-templates/postgres-ssl:18`
- Deployment do Postgres: `853e47f7-120a-46c7-99e2-d53a13a3d301` — `SUCCESS`
- Volume montado em `/var/lib/postgresql/data`, 500 MB.
- Uso de disco observado após a migration: aproximadamente 0,146 GB.
- A aba Backups do Railway mostrou `No Backups`.
- Criação de backups de volume e PITR não está disponível no plano atual sem upgrade para Pro.
- PITR não está habilitado.
- Portanto, NÃO existe proteção contínua point-in-time neste ambiente.

## Backup lógico confirmado para a migração atual

Como alternativa sem upgrade de plano, foi criado o endpoint administrativo:

`GET /api/v1/admin/database-backup`

Características:

- restrito a administrador de rede;
- usa `pg_dump` PostgreSQL 18;
- formato custom `--format=custom`;
- `--no-owner` e `--no-acl`;
- não altera schema nem dados;
- download é marcado como `no-store`;
- o evento de download é auditado.

Backup confirmado antes da migration:

- arquivo: `imperio-postgres-2026-10-02T20-06-42-410Z.dump`;
- tamanho observado no navegador: aproximadamente 1,7 MB;
- requisição do backend: HTTP 200 em 2026-10-02T20:06:36Z;
- checkpoint de aplicação que gerou o arquivo: `ec9009bb074fa52dea9f9352b3b1f9f1e1111fa6`.

Para ESTA migração, o gate de proteção está:

`PROTECTED_BY_CONFIRMED_LOGICAL_BACKUP_2026_10_02`

Esse estado não equivale a PITR nem a backup automático contínuo. Qualquer dado criado depois do horário do dump não existe nesse arquivo.

## Validação pós-migration

A migration controlada de produção executou `prisma migrate deploy` com o gate `SCHEMA_MIGRATION_ENABLED=true`.

Resultado confirmado:

- `12 migrations found in prisma/migrations`;
- `No pending migrations to apply.`;
- backend iniciou com sucesso;
- as três unidades canônicas permaneceram ativas;
- após a validação, `SCHEMA_MIGRATION_ENABLED=false`;
- `MIGRATION_IMPORT_ENABLED=false`;
- `CLIENT_BATCH_COMMIT_ENABLED=false`;
- `OPERATIONAL_WRITES_UNITS=centro`.

Isso confirma que o schema de produção estava alinhado ao repositório e que nenhum import/commit de clientes foi liberado neste bloco.

## Verificação do arquivo de backup

Antes de qualquer restauração, valide o arquivo sem escrever em banco:

```bash
pg_restore --list imperio-postgres-2026-10-02T20-06-42-410Z.dump
```

O comando deve listar os objetos do dump e terminar sem erro. Se o arquivo estiver corrompido, NÃO avance para restauração.

## Rollback de aplicação

Deploys devem ser tratados por SHA exato.

- SHA atual validado: `ec9009bb074fa52dea9f9352b3b1f9f1e1111fa6`.
- SHA anterior validado antes da função de backup: `63a1c36ad9a1c8ad4f0b0550a7e74258537bb133`.

Em regressão de aplicação, redeploy do SHA exato é preferível a alterar `main`.

## Rollback de dados com o .dump

NUNCA restaure o dump diretamente por cima do PostgreSQL de produção enquanto a operação estiver escrevendo.

Procedimento seguro:

1. bloquear escrita operacional;
2. validar o arquivo com `pg_restore --list`;
3. criar um PostgreSQL 18 separado para recuperação;
4. restaurar o dump nesse banco separado;
5. validar schema, contagens e dados críticos;
6. somente depois decidir entre recuperação seletiva ou troca controlada do banco.

Exemplo de restauração em banco separado:

```bash
createdb imperio_restore_check
pg_restore \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --dbname imperio_restore_check \
  imperio-postgres-2026-10-02T20-06-42-410Z.dump
```

Não usar `--clean` contra o banco de produção como primeira ação.

## Limitação sem PITR

No plano atual, o rollback de dados volta apenas até o instante do dump disponível. Se houver um incidente depois dele, alterações posteriores podem ser perdidas na restauração integral.

Por isso:

- gerar novo backup lógico antes de cada mudança estrutural/importação relevante;
- manter ao menos uma cópia fora do computador operacional;
- não confundir esse mecanismo com PITR.

## Gate para próxima etapa

O backup lógico confirmado permite seguir para validações/importações controladas desta migração específica, mantendo:

- `MIGRATION_IMPORT_ENABLED=false` até o bloco que explicitamente autorizar importação;
- `CLIENT_BATCH_COMMIT_ENABLED=false` até aprovação explícita do batch/reportHash;
- `OPERATIONAL_WRITES_UNITS=centro`.

Nenhum passo de restauração deve ser executado sem uma decisão explícita de incidente.

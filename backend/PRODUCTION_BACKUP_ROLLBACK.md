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
- `OPERATIONAL_WRITES_UNITS=centro,big,shopping-contagem`.

Isso confirma que o schema de produção estava alinhado ao repositório e que nenhum import/commit de clientes foi liberado neste bloco. Em 2026-10-03 a allowlist operacional foi ampliada, por autorização explícita do proprietário, para as três unidades canônicas.

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

## Estado revalidado em 2026-10-04

Auditoria final do Grupo 1:

- produção frontend permanece em `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`;
- produção backend permanece em `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`;
- branch oficial auditada: `b8cc923fec9ed64793dca001502a458b2e4bfab4`;
- CI da branch: V98 Backend CI run 264 — verde;
- a branch está 19 commits à frente do backend atualmente implantado e 0 atrás;
- existe na branch a migration `20261004_v99_command_service_quantity`, ainda não autorizada/aplicada em produção neste bloco;
- a migration estrutural de 2026-10-03 ocorreu depois do dump histórico de 2026-10-02;
- portanto o dump `imperio-postgres-2026-10-02T20-06-42-410Z.dump` é um checkpoint histórico, NÃO um backup suficiente para proteger os dados atuais antes do próximo deploy/migration.

Gate de segurança atual:

`NEXT_PRODUCTION_CHANGE_BLOCKED_PENDING_FRESH_LOGICAL_BACKUP_2026_10_04`

Antes de qualquer próximo deploy que altere comportamento, aplicação de migration, importação ou promoção de dados em produção:

1. gerar um novo `.dump` pelo endpoint administrativo;
2. registrar filename, horário, bytes e SHA da aplicação que gerou o arquivo;
3. validar o arquivo com `pg_restore --list`;
4. manter uma cópia fora do computador operacional;
5. somente então autorizar migration/deploy;
6. após a mudança, validar healthcheck, schema, três unidades e gates;
7. manter o SHA anterior exato disponível para rollback de aplicação.

O backup de 2026-10-02 permanece válido apenas como checkpoint histórico. Uma restauração integral dele pode perder todo dado criado depois daquele instante.

## Rollback de aplicação — estado atual

Enquanto nenhum novo deploy for autorizado:

- frontend validado em produção: `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`;
- backend validado em produção: `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`.

Esses SHAs devem ser tratados como pontos de retorno da aplicação antes da próxima mudança de produção. Não alterar `main` para executar rollback; preferir redeploy do SHA exato.

## Gate para próxima etapa

O Grupo 1 pode ser encerrado tecnicamente na branch, mas nenhuma mudança adicional em produção fica autorizada por este documento.

Devem permanecer fechados até o bloco explicitamente correspondente:

- `MIGRATION_IMPORT_ENABLED=false`;
- `CLIENT_BATCH_COMMIT_ENABLED=false`;
- demais gates de promoção/finalização de clientes.

A allowlist operacional observada continua registrada como `centro,big,shopping-contagem`, sem que este runbook autorize novo go-live por unidade.

Nenhum passo de restauração deve ser executado sem uma decisão explícita de incidente.

# Grupo 2 — checkpoint final GO/NO-GO

Data do checkpoint: 2026-10-05.

Este documento fecha tecnicamente o Grupo 2 na branch oficial. Ele NÃO autoriza deploy, migration, alteração de Railway/PostgreSQL, importação, finalização de staging ou promoção de clientes reais.

## Fonte de verdade auditada

- Repositório: `pietroboschi-del/imperio-das-unhas`
- Branch: `official-three-units-integration`
- Base funcional auditada: `85413c92567fa02a222bf1e0f4bd89a3a1011877`
- CI da base: `V98 Backend CI` run 288 — `SUCCESS`
- Produção frontend antes deste checkpoint: `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`
- Produção backend antes deste checkpoint: `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`
- Railway production: frontend, backend e Postgres online, sem staged changes efetivas.

## Decisão GO/NO-GO

**GO técnico para preparação de produção.**

Na auditoria final deste grupo não existe falha crítica concreta conhecida que obrigue novo desenvolvimento antes da preparação de produção ou antes dos cadastros manuais das três unidades.

O fluxo CLIENTS_ONLY possui testes de contrato e integração cobrindo, entre outros pontos:

- isolamento de batch/onda e fase;
- idempotência de staging e commit;
- bloqueio de estado parcialmente importado;
- relatório recalculado sobre o batch pendente completo;
- aprovação por reportHash;
- revisão humana obrigatória para ambiguidades;
- múltiplos matches centrais;
- merges e ciclos de merge;
- preservação de campos centrais;
- unidade canônica;
- parser/proveniência;
- rejeição de CPF placeholder de dígitos repetidos como identidade forte.

Este checkpoint não declara ausência matemática de qualquer caso de borda futuro; declara ausência de falha crítica conhecida no escopo necessário para fechar o Grupo 2.

## Migrations pendentes em produção

Comparando o backend atualmente implantado com a base funcional auditada, existem duas migrations novas ainda não incorporadas pelo deploy atual:

1. `20261004_v99_command_service_quantity`
   - adiciona `CommandServiceItem.quantity DECIMAL(14,4) NOT NULL DEFAULT 1`;
   - alteração aditiva.

2. `20261004_v99_client_duplicate_review_target_client`
   - adiciona `ClientDuplicateReview.targetClientId TEXT`;
   - alteração aditiva e nullable.

O backend de produção atual iniciou com `SCHEMA_MIGRATION_ENABLED=false`, portanto não aplicou migrations automaticamente nesse deployment.

## Ordem obrigatória antes do novo deploy

A próxima alteração de produção continua bloqueada até um backup lógico fresco e validado.

Sequência autorizável em bloco separado:

`BACKUP -> MIGRATION -> DEPLOY -> SMOKE TEST`

Antes da migration:

- gerar dump lógico fresco;
- registrar arquivo, horário e tamanho;
- validar com `pg_restore --list`;
- manter cópia fora do computador operacional.

## Release candidate

Após este checkpoint, o SHA deste commit deve ser usado como referência única de preparação para frontend e backend. Não implantar `main` nem uma branch flutuante.

O deploy efetivo depende de autorização explícita posterior.

## Gates após migration/deploy

Após aplicar as migrations e subir a release, os gates de migração/promoção devem permanecer fechados:

- `SCHEMA_MIGRATION_ENABLED=false`;
- `MIGRATION_IMPORT_ENABLED=false`;
- `CLIENT_BATCH_COMMIT_ENABLED=false`;
- `CLIENT_BATCH_FINALIZE_ENABLED=false`;
- `SHADOW_READS_ENABLED=false`;
- `READ_THROUGH_ENABLED=false`;
- `OPENAPI_ENABLED=false`.

`CLIENT_BATCH_REPORT_ON_START` deve ficar vazio/desativado salvo auditoria pontual autorizada.

As escritas operacionais NÃO fazem parte desses gates de migração. O estado operacional validado em produção é:

- `OPERATIONAL_WRITES_ENABLED=true`;
- `OPERATIONAL_WRITES_UNITS=centro,big,shopping-contagem`.

## Produção não alterada

A criação deste checkpoint altera somente o repositório/branch. Não executa:

- deploy;
- Railway config;
- migration;
- escrita no PostgreSQL;
- importação/finalização/promoção de clientes reais.

## Próxima autorização esperada

Nenhum passo de produção deve ser iniciado por este checkpoint.

A próxima execução deve começar somente após autorização explícita do proprietário para:

`BACKUP -> MIGRATION -> DEPLOY -> SMOKE TEST`

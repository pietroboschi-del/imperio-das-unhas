# Grupo 1 — checkpoint final

Data do checkpoint: 2026-10-04.

Este documento fecha tecnicamente o Grupo 1 na branch oficial. Ele não autoriza deploy, migration, importação, promoção de clientes, restore ou alteração de gates em produção.

## Fonte de verdade

- Repositório: `pietroboschi-del/imperio-das-unhas`
- Branch: `official-three-units-integration`
- Base auditada antes deste marcador: `bb02f650721f4cf9cfd2e54e53914828ae548a14`
- Última CI auditada: `V98 Backend CI` run 265 — SUCCESS

## Produção permanece inalterada

- Frontend: `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`
- Backend: `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`
- Railway frontend: online
- Railway backend: online
- Railway Postgres: online

No momento do checkpoint, a branch estava:

- 20 commits à frente do backend implantado e 0 atrás;
- 17 commits à frente do frontend implantado e 0 atrás.

Nenhum dos fixes posteriores ao estado de produção foi implantado por este checkpoint.

## Grupo 1 concluído na branch

Foram auditados e protegidos por testes:

- estado/alinhamento das três unidades;
- migration estrutural de categorias/workstations;
- booking público com escala real de profissionais;
- autenticação, sessão, usuários, permissões e unidades;
- clientes e idempotência por unidade;
- catálogo estrutural e vínculos profissional/serviço;
- agenda interna, bloqueios all-day, idempotência e consistência Booking/BookingItem;
- comandas, caixa, suprimento/sangria e pagamentos;
- idempotência financeira;
- matemática da comanda;
- sinal, crédito, taxa e gorjeta;
- quantidade × preço e desconto por item;
- persistência de quantity em CommandServiceItem;
- coerência entre snapshot.lines e totais da comanda, inclusive composição mista de serviço + produto;
- backup lógico e plano de rollback.

## Migration ainda pendente para produção

A branch contém:

`20261004_v99_command_service_quantity`

Ela foi validada apenas em PostgreSQL isolado da CI. Não foi aplicada ao PostgreSQL de produção neste checkpoint.

## Gate obrigatório antes da próxima mudança em produção

Permanece ativo no runbook:

`NEXT_PRODUCTION_CHANGE_BLOCKED_PENDING_FRESH_LOGICAL_BACKUP_2026_10_04`

Antes de qualquer deploy com mudança de comportamento, migration, importação ou promoção de dados:

1. gerar um novo backup lógico `.dump`;
2. registrar filename, horário, bytes e SHA da aplicação;
3. validar o dump com `pg_restore --list`;
4. manter cópia fora do computador operacional;
5. só então autorizar explicitamente migration/deploy;
6. validar healthcheck, schema, três unidades e gates após a mudança.

O dump de 2026-10-02 é somente checkpoint histórico e não protege os dados atuais contra perda integral.

## Rollback de aplicação

Enquanto produção não mudar, os pontos de retorno válidos permanecem:

- frontend: `a5e43d114dd34cac2231a96cbc3d5d46f0d44f59`;
- backend: `920d74cbb5856ab3bdb1c63c1c0c762c82346cba`.

Rollback deve preferir redeploy do SHA exato. Restore de banco nunca deve começar diretamente sobre produção; deve ser validado primeiro em PostgreSQL separado.

## Cliente real e Grupo 2

Nenhum cliente real foi promovido por este checkpoint.

Grupo 2 continua bloqueado. A autorização explícita exigida para iniciar o próximo grupo é:

`INICIAR GRUPO 2`

Até essa instrução, não iniciar persistência/migração central de clientes além dos contratos, rehearsals e ferramentas já existentes.

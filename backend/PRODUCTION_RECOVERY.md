# PostgreSQL de produção — backup e rollback

## Estado confirmado

Ambiente: `production` no projeto Railway `imperio-das-unhas`.

Banco definitivo:
- serviço: `Postgres`;
- volume: `postgres-volume`;
- mount: `/var/lib/postgresql/data`;
- imagem: PostgreSQL oficial Railway;
- último deploy observado após o hardening de backup: `853e47f7-120a-46c7-99e2-d53a13a3d301`;
- status do deploy: `SUCCESS`.

Em 2026-10-01 foi aplicada ao volume a política `DAILY`. A documentação da Railway define retenção de 6 dias para essa agenda. O conector atual não expõe a listagem de schedules/backups no read-back, portanto a existência de um backup individual deve ser confirmada pela listagem de backups antes de qualquer importação real.

## Regra obrigatória antes da migração real

NÃO iniciar importação de dados reais sem cumprir todos os itens:

1. manter escrita operacional desligada;
2. confirmar que o backend aponta para o PostgreSQL de produção;
3. criar um backup manual imediatamente antes da importação;
4. registrar o ID e timestamp desse backup;
5. confirmar que o backup aparece na listagem;
6. somente então executar reconciliação/importação;
7. preservar o backup pré-migração até a validação ponta a ponta do Centro.

Com Railway CLI, a operação esperada é:

```bash
railway postgres pitr backup create --project 6151f6fc-f429-49ad-8791-7ea4c6eb17d5 --environment production --service Postgres --name pre-real-data-cutover
railway postgres pitr backup list --project 6151f6fc-f429-49ad-8791-7ea4c6eb17d5 --environment production --service Postgres --json
```

Não versionar credenciais ou `DATABASE_URL`.

## Rollback

### Código

Rollback de aplicação deve usar SHA exato. Nunca usar `main` ou branch flutuante como referência de rollback.

### Dados

Se a importação falhar antes da liberação operacional:

1. interromper novas escritas;
2. guardar logs/relatório da falha;
3. identificar o backup manual `pre-real-data-cutover`;
4. restaurar somente esse backup confirmado;
5. validar `/api/v1/health`;
6. conferir as três unidades e saldos críticos;
7. só reabrir escrita após aprovação da reconciliação.

Restauração de volume é destrutiva para o estado atual do banco e NÃO deve ser executada como simples teste no banco de produção. O ensaio de restauração deve ocorrer antes do cutover operacional usando uma cópia/serviço isolado quando disponível.

## Gate de go-live

O go-live fica bloqueado se qualquer um destes itens estiver ausente:
- backup manual pré-migração com ID conhecido;
- listagem confirmando o backup;
- reconciliação aprovada;
- ensaio de restauração isolado ou procedimento de restauração validado;
- checkpoint do SHA de aplicação anterior;
- escrita ainda restrita à unidade autorizada no momento do cutover.

# Produção — backup e rollback

Este runbook pertence à release oficial das três unidades. Ele não autoriza migração nem libera escrita operacional por si só.

## Estado confirmado

- Projeto Railway: `imperio-das-unhas`
- Ambiente: `production`
- Postgres: `e051bb64-079a-4718-a113-80fe38ddb016`
- Volume: `fe0fe9f6-5883-444e-aa2e-e86b095682e7`
- Imagem: `ghcr.io/railwayapp-templates/postgres-ssl:18`
- Último deployment observado do Postgres: `853e47f7-120a-46c7-99e2-d53a13a3d301` — `SUCCESS`
- Backup automático: diário, retenção esperada de 6 dias.

## Gate obrigatório antes de migrar dados reais

A migração real NÃO pode começar enquanto não existir pelo menos uma das proteções abaixo confirmada:

1. backup manual do volume criado imediatamente antes da migração, com ID/timestamp registrado; ou
2. PITR habilitado e saudável, com primeiro base backup concluído e janela de restauração disponível.

O conector Railway usado na automação atual não expõe criação de backup manual nem habilitação/status de PITR. Portanto, enquanto isso não for confirmado fora do conector, o estado é:

`BLOCKED_UNTIL_MANUAL_BACKUP_OR_PITR_CONFIRMED`

## Backup manual recomendado

Pela Railway CLI autenticada no mesmo projeto:

```bash
railway postgres pitr backup create \
  --project 6151f6fc-f429-49ad-8791-7ea4c6eb17d5 \
  --environment 2a540e97-f088-407e-9da4-52ae7dd74ca1 \
  --service e051bb64-079a-4718-a113-80fe38ddb016 \
  --name pre-migration-official-2026-10-01
```

Depois, registrar o ID e timestamp retornados antes de qualquer importação.

## Opção de proteção adicional — PITR

```bash
railway postgres pitr enable \
  --project 6151f6fc-f429-49ad-8791-7ea4c6eb17d5 \
  --environment 2a540e97-f088-407e-9da4-52ae7dd74ca1 \
  --service e051bb64-079a-4718-a113-80fe38ddb016
```

Após habilitar, confirmar:

```bash
railway postgres pitr status \
  --project 6151f6fc-f429-49ad-8791-7ea4c6eb17d5 \
  --environment 2a540e97-f088-407e-9da4-52ae7dd74ca1 \
  --service e051bb64-079a-4718-a113-80fe38ddb016
```

PITR restaura em um novo serviço irmão e não sobrescreve o banco de origem.

## Rollback de aplicação

A aplicação deve ser implantada por SHA exato. Em caso de regressão de aplicação, volte o serviço para o último SHA validado anterior ao incidente. Não altere `main` como mecanismo de rollback.

## Rollback de dados

Nunca execute restauração in-place do volume durante operação normal sem uma decisão explícita de incidente.

Preferência:

1. se PITR estiver habilitado, restaurar para um serviço irmão no instante anterior ao incidente;
2. validar o serviço restaurado;
3. somente então decidir se haverá troca de `DATABASE_URL` ou recuperação seletiva dos dados.

Se houver apenas backup de volume, tratar a restauração como operação destrutiva e interromper a escrita antes de qualquer restore.

## Proibição

Não iniciar reconciliação/importação real se o gate de backup acima estiver bloqueado.

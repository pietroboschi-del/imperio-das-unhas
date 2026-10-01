# CLIENTS_ONLY — batches versionados de clientes

Este fluxo migra clientes das três unidades sem tratar exportações sucessivas como importações cumulativas.

## Modelo

Cada arquivo exportado da origem é um snapshot independente de uma unidade. Um batch pode conter de 1 a 3 arquivos e possui uma fase:

- `REHEARSAL`: mapeamento, normalização e detecção de duplicidades;
- `PRE_CUTOVER`: nova fotografia para medir mudanças desde o ensaio;
- `FINAL`: único tipo elegível para promoção, sempre após dry-run e aprovação pelo hash do relatório.

O mesmo `BATCH_FINAL` pode ser concluído em ondas: Centro primeiro; Big Shopping e Shopping Contagem depois. Quando uma unidade já foi promovida, seus envelopes ficam como auditoria e deixam de participar da próxima onda pendente. Assim, uma exportação final posterior de Big/Shopping é comparada com o PostgreSQL já em operação sem reaplicar o snapshot final do Centro.

## Proveniência obrigatória

Cada arquivo carrega `unitId`, `exportedAt`, `fileName`, `fileHash` SHA-256 e `batchId`. Cada linha guarda `sourceRow` e, quando existir, `sourceId`.

O hash do arquivo deve ser calculado sobre os bytes originais do Excel antes do parsing. O adaptador de Excel entrega ao endpoint as linhas parseadas preservando esses metadados; este bloco não executa nenhum arquivo real.

## Dry-run

`POST /api/v1/migrations/v94/clients/batches/dry-run`

O dry-run:

1. valida o batch/unidade;
2. normaliza nome, telefone, e-mail e CPF;
3. persiste somente staging/auditoria em `MigrationEnvelope` + `MigrationEntity`;
4. compara cada unidade com seu snapshot anterior;
5. reconcilia pessoas entre os arquivos atuais;
6. compara com os clientes centrais atuais;
7. gera plano, conflitos e `reportHash`.

Reprocessar o mesmo arquivo no mesmo batch reutiliza o staging existente. O mesmo `batchId + unitId` não aceita outro hash de arquivo.

## Deduplicação

Correspondências fortes permitidas automaticamente:

- CPF normalizado;
- e-mail + nome normalizado;
- telefone + nome normalizado;
- proveniência já registrada de `unitId + sourceId`.

Telefone ou e-mail isolado nunca causa merge automático. Compartilhamentos ambíguos entre linhas ou contra o PostgreSQL entram em `REVIEW_REQUIRED`.

Cliente é entidade de rede. Um cluster identificado em mais de uma unidade produz um cliente e múltiplos `ClientUnitLink`.

A unidade do arquivo nunca vira `registrationUnitId` por inferência. Esse campo só é considerado quando `registrationUnitProven=true` vier comprovado na origem.

## Comparação com snapshots anteriores

O relatório classifica linhas em novas, alteradas, iguais e ausentes no snapshot novo. Ausência em exportação posterior é somente informação de reconciliação: o fluxo CLIENTS_ONLY não apaga nem desativa clientes ou vínculos centrais.

Snapshots antigos são evidência de auditoria/reconciliação. Nunca são somados cegamente aos novos.

## Conflitos com dados centrais

Para cliente já existente:

- vínculo de nova unidade pode ser adicionado;
- campo central vazio pode receber valor seguro;
- valor central não vazio diferente é preservado por padrão e vira conflito;
- `updatedAt` da origem só é marcado como evidência de possível novidade quando `sourceUpdatedAtReliable=true`;
- nenhum Excel legado ganha precedência automática.

## Aprovação e commit

`GET /api/v1/migrations/v94/clients/batches/:batchId/report` recalcula o relatório contra o estado atual do PostgreSQL. Se houver unidades ainda pendentes em um `FINAL` escalonado, o relatório considera apenas essa onda pendente; unidades já promovidas permanecem como auditoria.

`POST /api/v1/migrations/v94/clients/batches/commit` exige simultaneamente:

- batch em fase `FINAL`;
- `MIGRATION_IMPORT_ENABLED=true`;
- `CLIENT_BATCH_COMMIT_ENABLED=true`;
- `approvalReportHash` idêntico ao relatório recalculado;
- resolução explícita de todo cluster `REVIEW_REQUIRED`.

O commit roda em transação `Serializable`. Se o PostgreSQL mudar depois da aprovação, o hash muda e a promoção é recusada, exigindo novo dry-run.

Em produção normal, `CLIENT_BATCH_COMMIT_ENABLED=false`. Este bloco não importa clientes reais.

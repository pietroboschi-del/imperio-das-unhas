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


## Entrada direta de Excel (.xlsx)

`POST /api/v1/migrations/v94/clients/batches/excel/dry-run` aceita `multipart/form-data` com até 3 campos `files` e um campo `manifest` JSON.

Exemplo de manifest:

```json
{
  "batchId": "BATCH_1_REHEARSAL",
  "phase": "REHEARSAL",
  "files": [
    {"unitId":"centro","exportedAt":"2026-10-01T11:30:00-03:00"},
    {"unitId":"big","exportedAt":"2026-10-01T11:35:00-03:00"},
    {"unitId":"shopping-contagem","exportedAt":"2026-10-01T11:40:00-03:00"}
  ]
}
```

A ordem das entradas do manifest corresponde à ordem dos arquivos enviados. O servidor calcula SHA-256 sobre os bytes originais do arquivo, preserva o nome original, a linha original do Excel e usa a primeira planilha por padrão. `sheetName` pode ser informado por arquivo quando necessário.

O parser não executa macros nem fórmulas. Ele lê apenas valores armazenados no `.xlsx`, impõe limites de tamanho/expansão ZIP e rejeita `.xls` legado. Não há dependência externa de parser Excel.

Cabeçalhos conhecidos em português/inglês são mapeados para nome, telefone, e-mail, CPF, identificador de origem e data de alteração. Cabeçalhos não reconhecidos continuam preservados na linha bruta e aparecem em `unmappedHeaders`.

A coluna genérica `Unidade` NÃO é convertida em `registrationUnitId`. Somente cabeçalhos explicitamente equivalentes a “unidade de cadastro” podem preencher esse campo, preservando a regra de não inferir a unidade original a partir do arquivo.


## Layout real Avec SalãoVIP validado

O export real analisado utiliza uma única aba `Sheet1` com 20 colunas:

`Cliente`, `Código`, `Aniversário`, `Telefone`, `Celular`, `E-mail`, `Sexo`, `Como Conheceu`, `CPF`, `CEP`, `Endereço`, `Número`, `Estado`, `Cidade`, `Complemento`, `Bairro`, `Profissão`, `Cadastrado`, `Obs`, `RG`.

Regras específicas:

- `Celular` é o telefone principal quando preenchido;
- `Telefone` é preservado como telefone fixo secundário e só vira principal quando não existe celular;
- `Código` é apenas identificador/proveniência do legado e nunca é usado sozinho para fundir clientes entre unidades;
- `Cadastrado` é a data de criação no sistema de origem, não um `updatedAt`;
- `Aniversário` é normalizado apenas quando a data é válida; valores inválidos continuam preservados no `raw` do staging, mas não são promovidos como data válida;
- `Número = 0` é tratado como ausência, pois o export do legado usa zero em campos vazios;
- sexo, origem (`Como Conheceu`), CEP/endereço, profissão, observações e RG permanecem preservados no payload normalizado de staging;
- nenhum desses campos altera a regra de deduplicação principal, que continua baseada em CPF ou combinações de identidade mais fortes;
- dados do arquivo real usado para validar o formato não são armazenados no repositório.

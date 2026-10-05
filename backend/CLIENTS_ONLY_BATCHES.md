# CLIENTS_ONLY — batches versionados de clientes

Este fluxo migra clientes das três unidades sem tratar exportações sucessivas como importações cumulativas.

## Modelo

Cada arquivo exportado da origem é um snapshot independente de uma unidade. Um batch pode conter de 1 a 3 arquivos e possui uma fase:

- `REHEARSAL`: mapeamento, normalização e detecção de duplicidades;
- `PRE_CUTOVER`: nova fotografia para medir mudanças desde o ensaio;
- `FINAL`: único tipo elegível para promoção, sempre após dry-run e aprovação pelo hash do relatório.

`batchId` identifica uma única onda imutável de exportação. Antes da primeira promoção, o batch pode reunir de 1 a 3 unidades da mesma onda. Depois que o batch é importado, ele **não pode receber outra unidade, outro arquivo, outra revisão de parser nem uma nova exportação**.

Se Centro for promovido em um batch próprio e Big/Shopping forem exportados depois, Big/Shopping devem usar **outro `batchId`**. O novo batch será comparado com o PostgreSQL já atualizado pelo batch anterior. Estado parcialmente importado dentro do mesmo `batchId` é tratado como inconsistência e nunca como continuação normal.

Retry idêntico do batch já importado continua idempotente: o mesmo `batchId` completo, com os mesmos envelopes e o mesmo `approvalReportHash`, pode ser reenviado sem reaplicar clientes.

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

Reprocessar o mesmo arquivo no mesmo batch reutiliza o staging existente enquanto isso representar o mesmo snapshot. O mesmo `batchId + unitId` não aceita outro hash de arquivo. Uma nova exportação, mesmo da mesma unidade, exige novo `batchId`. Depois de qualquer importação do batch, nenhuma nova unidade pode ser anexada a ele.

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

`GET /api/v1/migrations/v94/clients/batches/:batchId/report` recalcula o relatório contra o estado atual do PostgreSQL para o conjunto daquele batch. O conjunto promovível deve estar integralmente pendente ou integralmente importado. Misturar envelopes `IMPORTED` com envelopes pendentes no mesmo `batchId` é estado inconsistente e bloqueia a promoção.

`POST /api/v1/migrations/v94/clients/batches/commit` exige simultaneamente:

- batch em fase `FINAL`;
- `MIGRATION_IMPORT_ENABLED=true`;
- `CLIENT_BATCH_COMMIT_ENABLED=true`;
- `approvalReportHash` idêntico ao relatório recalculado;
- resolução explícita de todo cluster `REVIEW_REQUIRED`.

O commit roda em transação `Serializable`. Se o PostgreSQL mudar depois da aprovação, o hash muda e a promoção é recusada, exigindo novo dry-run.

Em produção normal, `CLIENT_BATCH_COMMIT_ENABLED=false`. Este bloco não importa clientes reais.

### Regra operacional de ondas

Exemplo correto:

- `CENTRO_FINAL_01`: Centro exportado, aprovado e importado;
- nova exportação posterior de Big/Shopping: `BIG_SHOPPING_FINAL_01` (ou outro novo `batchId`);
- nova fotografia posterior do Centro: `CENTRO_FINAL_02`.

Exemplo proibido: importar `CENTRO_FINAL_01` e depois tentar adicionar Big ou Shopping Contagem ao mesmo `CENTRO_FINAL_01`.

Antes de importar um batch ainda totalmente pendente, é permitido incluir outras unidades que pertençam à **mesma onda**, desde que não exista outro arquivo para a mesma `unitId` e o relatório seja recalculado/aprovado novamente.


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


## Refinamento de contato compartilhado

Telefone ou e-mail repetido, isoladamente, não é evidência suficiente para fundir clientes e também não deve bloquear automaticamente pessoas com nomes claramente distintos.

A reconciliação fraca agora funciona assim:

- CPF e combinações fortes continuam prevalecendo;
- telefone/e-mail + nome igual continuam sendo chaves fortes já existentes;
- telefone/e-mail compartilhado entre nomes claramente diferentes mantém clientes separados;
- telefone/e-mail compartilhado com nomes suficientemente parecidos gera `AMBIGUOUS_WEAK_MATCH` e continua em `REVIEW_REQUIRED`;
- o conflito fraco registra o campo (`phone` ou `email`) e o valor que originou a revisão;
- textos que não têm formato mínimo de e-mail (por exemplo `on`) não participam da deduplicação;
- nenhuma dessas regras permite merge automático apenas por telefone.

O objetivo é reduzir falsos positivos causados por telefone familiar sem transformar diferenças de grafia ou cadastros possivelmente duplicados em merges silenciosos.

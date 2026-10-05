# Backup lógico automático — preparação

Este documento descreve o workflow `.github/workflows/production-logical-backup.yml`.

Ele **não substitui** o endpoint administrativo `GET /api/v1/admin/database-backup`.
O endpoint manual continua sendo o backup extraordinário obrigatório antes de migration,
importação, promoção de dados ou outra mudança estrutural relevante.

## Estratégia de acesso

O PostgreSQL de produção não possui TCP proxy público. O workflow não deve criar um.

O backup automático reutiliza o endpoint administrativo HTTPS do backend. Esse endpoint
já executa, dentro da Railway e com acesso privado ao PostgreSQL:

```text
pg_dump --format=custom --no-owner --no-acl
```

A GitHub Action não recebe `DATABASE_URL`, senha do PostgreSQL, token da Railway nem
qualquer chave privada de criptografia.

A Action autentica em `/api/v1/auth/login` usando uma conta `networkAdmin` dedicada à
automação e baixa o dump por `/api/v1/admin/database-backup`.

### Por que esta opção foi escolhida

- mantém o PostgreSQL sem exposição pública;
- evita um `RAILWAY_API_TOKEN` amplo em um repositório público;
- evita `DATABASE_URL` em GitHub Secrets;
- preserva o endpoint manual já auditado;
- mantém o `pg_dump` dentro do backend, onde o cliente PostgreSQL 18 já existe.

A conta usada pela Action deve ser dedicada ao backup. O modelo atual exige
`networkAdmin` para acessar o endpoint. Criar uma permissão de backup mais restrita
exigiria mudança de backend e não faz parte deste microbloco.

## Horário

O objetivo é uma execução por dia às **03:00 `America/Sao_Paulo`**.

GitHub Actions agenda cron em UTC. O workflow agenda 05:00 e 06:00 UTC e executa o
backup somente quando `TZ=America/Sao_Paulo date +%H` retorna `03`. Isso mantém uma
única execução diária mesmo se o fuso voltar futuramente de UTC-3 para UTC-2.

`workflow_dispatch` ignora essa janela e permite execução manual.

## Branch padrão e ativação

O repositório é público e a branch padrão atual é `main`.

GitHub executa `schedule` e disponibiliza normalmente `workflow_dispatch` a partir do
workflow presente na branch padrão. Portanto, enquanto este arquivo existir apenas em
`official-three-units-integration`, ele está **preparado, mas não ativado**.

Não alterar a branch padrão apenas para ativar o backup. A ativação deve ocorrer no
momento em que este workflow for incorporado conscientemente à `main`.

## GitHub Environment

Antes da primeira execução, criar o Environment:

```text
production-backup
```

Caminho:

```text
GitHub → repositório → Settings → Environments → New environment
```

Recomendação: restringir o environment à branch `main`. Não configurar reviewer
obrigatório se a intenção for manter o cron diário sem intervenção humana.

### Environment secrets

Criar em:

```text
Settings → Environments → production-backup → Environment secrets
```

#### `IMPERIO_BACKUP_USERNAME`

Valor: username de uma conta **dedicada** de automação no Império das Unhas com
`networkAdmin=true`.

Origem: cadastro de usuários do próprio sistema. Não vem da Railway.

Finalidade: autenticar a Action no endpoint administrativo de backup.

#### `IMPERIO_BACKUP_PASSWORD`

Valor: senha da mesma conta dedicada.

Origem: credencial definida para essa conta no próprio sistema.

Finalidade: autenticação HTTPS. Nunca deve ser escrita em arquivo versionado,
issue, chat, log ou variável não-secreta.

### Environment variables (não são secrets)

Criar em:

```text
Settings → Environments → production-backup → Environment variables
```

#### `IMPERIO_BACKUP_BASE_URL`

Valor: URL pública HTTPS do serviço `imperio-backend` em produção, sem barra final.

Origem:

```text
Railway → imperio-das-unhas → production → imperio-backend → Networking
```

Finalidade: URL base usada para login e download do backup. Não contém credenciais.

#### `IMPERIO_BACKUP_AGE_RECIPIENT`

Valor: **chave pública** age no formato `age1...`.

Gerar a chave em uma máquina confiável, fora do GitHub:

```bash
age-keygen -o imperio-backup-age-key.txt
```

O comando mostra a chave pública/recipient. Apenas a linha pública `age1...` vai para
o GitHub Environment variable.

A chave privada `imperio-backup-age-key.txt` **nunca** deve ir para GitHub,
Railway, repositório, artifact, chat ou workflow. Guardar em armazenamento seguro e
manter ao menos uma cópia offline protegida.

## Fluxo executado

1. confirma que a execução manual foi solicitada ou que são 03:00 em São Paulo;
2. valida HTTPS, recipient age e presença das credenciais;
3. autentica sem imprimir username/senha;
4. baixa o dump do endpoint administrativo;
5. confirma header `X-Backup-Format: pg_dump-custom` e magic bytes `PGDMP`;
6. valida com `postgres:18 pg_restore --list`;
7. calcula SHA-256 e tamanho do dump;
8. cria manifesto com nome, horário, bytes, SHA-256, SHA Git e run ID;
9. criptografa dump e manifesto separadamente com age/public key;
10. remove os arquivos em claro do runner por best effort (`shred`, com fallback para `rm`);
11. faz upload somente de arquivos criptografados e checksum do ciphertext;
12. retém o GitHub Artifact por 30 dias.

O artifact contém:

```text
imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.age
imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.manifest.json.age
imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.age.sha256
```

Nenhum `.dump` em claro é enviado ao GitHub.

## Recuperar e validar um backup

Baixar o artifact desejado em uma máquina segura que possua `age`, Docker e a chave
privada offline.

### 1. Validar o ciphertext baixado

```bash
sha256sum -c imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.age.sha256
```

### 2. Descriptografar dump e manifesto

```bash
age \
  --decrypt \
  --identity /caminho/seguro/imperio-backup-age-key.txt \
  --output imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump \
  imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.age

age \
  --decrypt \
  --identity /caminho/seguro/imperio-backup-age-key.txt \
  --output imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.manifest.json \
  imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump.manifest.json.age
```

### 3. Conferir SHA-256 do dump em claro

```bash
sha256sum imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump
```

Comparar o resultado com o campo `sha256` do manifesto descriptografado.

### 4. Validar a estrutura PostgreSQL sem restaurar

```bash
docker run --rm \
  -v "$PWD:/backup:ro" \
  postgres:18 \
  pg_restore --list "/backup/imperio-postgres-YYYY-MM-DDTHH-MM-SS.dump" \
  >/dev/null
```

Somente considerar o arquivo recuperável se checksum, descriptografia, SHA-256 e
`pg_restore --list` passarem.

## Restore

Este workflow **não restaura** banco.

Nunca fazer restore diretamente por cima de produção como primeira ação. Em incidente,
seguir `backend/PRODUCTION_BACKUP_ROLLBACK.md`: validar o dump, restaurar primeiro em
PostgreSQL 18 separado e conferir schema/dados antes de qualquer decisão de recuperação.

## Dados pessoais e retenção

O dump contém dados pessoais. O repositório é público, portanto:

- nunca commitar `.dump`;
- nunca commitar chave privada age;
- nunca subir dump não criptografado como artifact;
- nunca imprimir credenciais, `DATABASE_URL` ou conteúdo do dump em logs;
- manter artifacts por aproximadamente 30 dias;
- apagar cópias locais descriptografadas assim que a validação/recuperação terminar.

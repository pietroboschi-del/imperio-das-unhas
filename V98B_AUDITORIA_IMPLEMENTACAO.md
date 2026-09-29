# V98b — Auditoria de implementação

## Políticas de acesso

1. `@Public()` é a única forma de rota anônima.
2. Toda rota autenticada deve declarar explicitamente ao menos uma política: `@Authenticated`, `@NetworkAdmin`, `@UnitScoped` ou `@RequirePermissions`.
3. Ausência de política resulta em negação.
4. `networkAdmin` ignora escopo/permissão; somente a conta bootstrap do dono recebe esse atributo.
5. `allUnits` legado não concede administração de rede.
6. Permissões são avaliadas separadamente do escopo de unidade.

## Migração de usuários

Usuários legados entram sem senha, exigem ativação e recebem permissões convertidas conservadoramente. Papéis legados `admin`/`finance` tornam-se `ADMINISTRATIVE`, mas nunca `OWNER` nem `networkAdmin`.

## Cliente de rede

A API `/clients` exige uma unidade autorizada para estabelecer contexto operacional e permissão `clients.read`, porém retorna o cadastro global da rede conforme DEC-004. O payload legado não é exposto.

## Credenciais

- Argon2id para senha;
- token de ativação/reset aleatório;
- somente hash SHA-256 do token persiste;
- ativação: 24h por padrão;
- reset: 30min por padrão;
- tokens antigos invalidados;
- sessões ativas revogadas após troca.

## Rate limit

Persistência no PostgreSQL (`LoginRateLimit`) por IP e usuário+IP. Padrão: 5 falhas em janela de 15 minutos, bloqueio de 15 minutos. Valores são configuráveis.

## Contrato HTTP

Leituras Core utilizam `select` explícito, evitando retorno acidental de `legacyPayload`, hash de senha ou futuros campos internos. OpenAPI está preparado sob flag `OPENAPI_ENABLED`.

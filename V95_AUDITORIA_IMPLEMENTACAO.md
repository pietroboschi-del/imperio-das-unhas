# Auditoria de Implementação — V95

## Objetivo
Criar a fundação backend real em paralelo sem introduzir duas fontes operacionais de verdade.

## Decisões arquiteturais
1. O HTML/localStorage através do gateway V94 continua sendo a fonte operacional.
2. O backend V95 nasce com API `/api/v1`, PostgreSQL/Prisma e NestJS.
3. As primeiras rotas operacionais são somente leitura.
4. Importação em banco usa dry-run por padrão e `commit` depende de `MIGRATION_IMPORT_ENABLED=true`.
5. O envelope completo é preservado em staging antes da normalização.
6. Financeiro/Fiscal e demais domínios sensíveis ficam no staging nesta fase; não são promovidos prematuramente a modelos operacionais.

## Segurança
- senha: Argon2id;
- sessão: token opaco aleatório; somente SHA-256 do token é persistido;
- revogação/expiração de sessão no servidor;
- cookie HttpOnly/SameSite e opção Secure;
- CSRF por token associado à sessão;
- autorização de unidade no servidor;
- CORS explícito por ambiente;
- Helmet;
- credenciais locais não são importadas;
- contas legadas entram com `passwordResetRequired=true`;
- envelope com `sensitiveIncluded=true`, hash divergente ou segredo em claro é recusado.

## Migração e integridade
O validador V95 acrescenta verificações de:
- formato/contract/schema/revision;
- hash FNV-1a compatível com V94;
- IDs ausentes/duplicados;
- referências de unidade obrigatórias;
- categoria de serviço;
- unidades de profissionais/clientes/usuários;
- cliente referenciado por booking;
- usernames duplicados/ausentes;
- segredos em claro.

O importador usa transação `Serializable`, deduplicação do envelope por instância/revisão/hash e staging por coleção/ID.

## Normalização inicial
Normalizados nesta fase:
- units;
- categories;
- services;
- pros + ProfessionalUnit;
- clients;
- bookings;
- userAccounts sem credenciais + UserUnitAccess.

Demais coleções permanecem integralmente disponíveis no staging para fases posteriores.

## Limitação consciente
As dependências NestJS/Prisma não foram baixadas neste ambiente. Por isso a V95 validou sintaxe TypeScript por transpile, contratos por teste Node sem dependências e a estrutura Prisma estaticamente. A compilação/`prisma validate` e a conexão com PostgreSQL devem ser executadas no ambiente de homologação após `npm install`.

# Changelog — V95 · Fundação Backend em Paralelo

## Fonte de verdade
V94 — Preparação para Arquitetura Centralizada.

## Alterações no sistema local
- `schemaVersion` elevado para 95.
- Migration `v95-parallel-backend-foundation` idempotente.
- `storageMeta.backendFoundationVersion=1`.
- `remoteSyncEnabled=false` e `operationalRemoteWritesEnabled=false` mantidos explicitamente.
- Configurações → Arquitetura passa a mostrar a fundação V95 e permite exportar o envelope sanitizado para homologação.
- Nenhum motor operacional passou a ler ou escrever no backend.

## Backend incluído no pacote
Diretório `backend/` com:
- NestJS + TypeScript;
- PostgreSQL + Prisma;
- Docker Compose para PostgreSQL de desenvolvimento/homologação;
- sessão opaca revogável armazenada no servidor;
- Argon2id para senhas;
- proteção CSRF em mutações autenticadas;
- autorização server-side por unidade (`X-Unit-Id`);
- usuário administrador de rede;
- importador do envelope V94/V95 com validação, dry-run e commit protegido por flag;
- staging integral do envelope;
- normalização inicial de unidades, categorias, serviços, profissionais, clientes, bookings e usuários;
- usuários legados importados sem senha e com redefinição obrigatória;
- endpoints operacionais iniciais somente de leitura.

## Política de migração
A V95 não faz cutover, push ou pull automático. O backend deve receber apenas cópia de dados em homologação até haver reconciliação das contagens, IDs, relações e métricas canônicas.

## Impacto financeiro
Nenhum. Caixa, Financeiro, DRE, comissões e demais fatos financeiros permanecem sob os motores locais atuais.

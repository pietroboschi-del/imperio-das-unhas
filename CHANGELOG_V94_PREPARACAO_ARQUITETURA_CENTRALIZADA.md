# V94 — Preparação para Arquitetura Centralizada

## Objetivo
Preparar a fonte de verdade V93 para migração progressiva a backend/API e banco central, sem ativar comunicação remota e sem alterar regras de negócio.

## Alterações
- `schemaVersion` evoluído para 94.
- Migration `v94-central-architecture-preparation` idempotente.
- Persistência local isolada atrás de `__imperioPersistenceGateway`.
- `load()`, backup pré-migração e `save()` deixam de acessar `localStorage` diretamente.
- Driver atual permanece `localStorage` e modo `local`.
- Cada base recebe `storageMeta.instanceId` persistente.
- `storageMeta.revision` passa a aumentar somente em gravações reais.
- Falha de gravação reverte metadados de revisão e preserva o banco anterior.
- Criadas coleções `syncOutbox` e `syncConflicts` para transição futura.
- Criado registro de contratos das entidades centrais, com escopo, unidade, PII, natureza financeira e política de concorrência.
- Criado contrato preliminar de API `/api/v1`, prevendo sessão backend, RBAC por unidade, idempotência e versionamento/ETag.
- Criado envelope de migração versionado, com hash de integridade.
- Exportação de migração nunca inclui senhas/tokens/API keys em texto puro; credenciais locais deverão ser redefinidas na migração.
- Outbox existe apenas como contrato explícito e não envia/puxa dados automaticamente.
- Adicionado diagnóstico de prontidão para centralização em Configurações → Arquitetura.

## Não alterado
Agenda, disponibilidade, capacidade física, Fila de Encaixe, Caixa, Financeiro, DRE, comissões, Estoque, Fiscal, V88, V92 e V93 preservam seus motores canônicos.

## Política de segurança
A V94 NÃO habilita backend remoto, dual-write, sincronização automática ou resolução de conflito. Até o cutover controlado, o armazenamento local continua sendo a única fonte operacional desta versão.

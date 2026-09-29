# Auditoria de Implementação — V94

## Fonte de verdade
V93 — Recepção, Metas e Desempenho.

## Fronteira de persistência
Antes da V94, `load()`, backup e `save()` acessavam `localStorage` diretamente. Na V94, esses acessos foram concentrados na porta `IMPERIO_PERSISTENCE_GATEWAY` / `window.__imperioPersistenceGateway`.

O driver continua sendo `localStorage`, portanto não há mudança operacional nem rede envolvida. O objetivo é permitir futura troca do driver sem reescrever os motores de negócio.

## Concorrência e identidade
`storageMeta` passa a conter:
- `instanceId`: identifica a instalação/base local;
- `revision`: revisão monotônica por gravação real;
- `lastMutationAt`;
- `lastWriterInstanceId`;
- `persistenceMode`;
- `centralArchitectureVersion`;
- `remoteSyncEnabled=false`.

Saves idempotentes não incrementam revisão. Em falha de persistência, o metadado de revisão é revertido.

## Contratos
A V94 registra contratos para entidades centrais e deixa explícitos:
- escopo de rede/unidade;
- campo de ID;
- campo de unidade quando aplicável;
- presença de PII;
- natureza financeira;
- append-only/imutabilidade quando aplicável;
- política de credenciais.

## Segurança de exportação
O envelope `imperio-central-migration` é sanitizado por padrão e por política. Senhas, tokens, segredos, API keys, private keys e credenciais são sempre redigidos. Não existe modo de exportação em claro. Chaves documentais fiscais (`accessKey`) são preservadas por não serem credenciais de API.

## Integridade
O envelope inclui hash FNV-1a de 32 bits para detectar alteração acidental na etapa de transporte/validação. Isso não substitui assinatura criptográfica futura do backend.

## Diagnóstico
`centralReadiness()` verifica IDs ausentes/duplicados e, para entidades unit-scoped obrigatórias, referências inválidas de unidade. O diagnóstico é consultivo e não altera dados.

## Sincronização
`syncOutbox` e `syncConflicts` foram incluídos na shape. `enqueueMutation()` existe para validar o contrato e deduplicação por idempotency key, mas nenhum evento operacional é enfileirado automaticamente nesta versão.

## Impacto financeiro
Nenhum. Consultas e diagnóstico V94 não alteram Caixa, lançamentos financeiros ou comissão.

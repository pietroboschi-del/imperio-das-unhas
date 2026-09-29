# Plano de Migração após V94

## Princípio
Não haverá duas fontes de verdade operacionais ativas sem mecanismo de reconciliação testado.

## Fase 1 — Backend em paralelo
- Criar NestJS + TypeScript.
- PostgreSQL + Prisma.
- Autenticação backend, sessão segura e RBAC por unidade.
- Modelos baseados nos contratos V94.
- Ambientes separados de desenvolvimento/homologação/produção.

O HTML/localStorage continua operacional e o backend ainda não recebe escrita de produção.

## Fase 2 — Importação de cópia e reconciliação
- Gerar envelope V94 sanitizado/validado.
- Importar dados em banco de homologação.
- Comparar contagens, IDs, relacionamentos, valores financeiros e métricas canônicas.
- Reexecutar relatórios e confrontar resultados com o sistema atual.

## Fase 3 — API de leitura em sombra
- Site e/ou cliente de homologação consultam API.
- Comparar respostas API com motores atuais.
- Nenhuma escrita remota da operação real.

## Fase 4 — Escrita controlada
Ordem sugerida:
1. catálogos/configurações;
2. clientes e profissionais;
3. Agenda/Fila;
4. comandas;
5. estoque;
6. Financeiro/Caixa/DRE e demais fatos sensíveis após reconciliação específica.

Todas as mutações devem usar idempotency key, transação e auditoria server-side.

## Fase 5 — Cutover
- PostgreSQL passa a ser a fonte de verdade.
- Frontend deixa de gravar fatos operacionais em localStorage.
- localStorage pode permanecer apenas como cache/configuração não sensível conforme arquitetura final.
- Ativar jobs/Redis/BullMQ somente depois de persistência central e idempotência estabilizadas.

## Fase 6 — Automação
Somente depois do cutover:
- WhatsApp multi-canal;
- lembretes/confirmações;
- Fila automática;
- sinais;
- webhooks;
- Central de Automações.

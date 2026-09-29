# Roadmap após V94

## Entregue
- Porta canônica de persistência mantendo localStorage.
- Identidade e revisão local.
- Contratos de entidades/API.
- Diagnóstico de prontidão para centralização.
- Envelope versionado e sanitizado para migração.
- Outbox/conflicts preparados, sem sincronização automática.

## Próximo passo recomendado — V95
**Fundação Backend em paralelo**, sem cutover:
- workspace NestJS/TypeScript;
- Prisma/PostgreSQL;
- modelos centrais iniciais;
- autenticação backend + sessões;
- RBAC e escopo por unidade;
- endpoint de health/readiness;
- importador de envelope V94 para banco de homologação;
- testes de reconciliação;
- frontend V94 continua sendo fonte operacional durante essa fase.

## Depois
- API de leitura em sombra e comparação com resultados atuais.
- Migração progressiva dos módulos.
- Site público e backoffice sobre a mesma fonte central.
- WhatsApp/jobs apenas depois do backend transacional.
- programa de Segurança/LGPD/backup/monitoramento antes de produção.

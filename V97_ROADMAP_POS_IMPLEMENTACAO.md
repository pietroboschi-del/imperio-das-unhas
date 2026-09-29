# Roadmap após V97

## Próximo corte recomendado — V98
- Homologar NestJS/Prisma/PostgreSQL em ambiente executável real.
- Executar importação V97 real.
- Testar RBAC horizontal e vertical com três unidades.
- Medir latência/erros do read-through.
- Expandir read-through, se aprovado, para Profissionais e Clientes com adapters canônicos.
- Agenda permanece local até os testes de equivalência de disponibilidade/capacidade estarem completos.

## Antes de qualquer escrita remota
- PostgreSQL real homologado.
- backups e restauração testados;
- auditoria backend;
- concorrência/idempotência;
- testes de autorização;
- observabilidade;
- plano de rollback.

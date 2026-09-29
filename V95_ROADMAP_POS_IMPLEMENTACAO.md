# Roadmap após V95

## Próxima etapa recomendada — V96 · Homologação e Leitura em Sombra
1. Instalar dependências do backend em ambiente isolado.
2. Subir PostgreSQL de homologação.
3. Executar `prisma validate`, migration e build NestJS.
4. Exportar envelope real sanitizado da V95.
5. Validar e importar cópia em dry-run e depois commit de homologação.
6. Reconciliar contagens, IDs, referências e métricas.
7. Testar horizontal/vertical privilege escalation e isolamento das três unidades.
8. Habilitar somente leituras em sombra do frontend de homologação, nunca escrita operacional.
9. Comparar respostas API com motores locais para Agenda/Clientes/Serviços/Profissionais.

## Depois
- escrita controlada de catálogos/configurações;
- clientes/profissionais;
- Agenda/Fila com idempotência e transações;
- comandas/estoque;
- Financeiro/Caixa/DRE após reconciliação específica;
- cutover PostgreSQL;
- somente então Redis/BullMQ e automações WhatsApp.

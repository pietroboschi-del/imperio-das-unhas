# Roadmap após V88

## Concluído
- V87 — rastreabilidade e recuperação da Fila.
- V87.1 — estabilização técnica e coleta prospectiva D-N.
- V88 — tendência de preenchimento por mesmo lead time.
- Indicadores funcionais da recuperação da Fila.
- Clientes únicos / bookings / serviços separados.
- Vagas livres reais e confirmações pendentes.
- Obrigatoriedade configurável de campos críticos.

## Próximas frentes recomendadas
1. **Categorias Dinâmicas + desacoplamento de regras**: CRUD, ordenação, ativo/inativo, estações, relatórios, DRE e eliminação de inferências por nome.
2. **UX estrutural / Agenda / responsividade real**: desktop, tablet e celular; navegação, tabelas, formulários e principal tela da recepção.
3. **Recepção e metas**: consolidar V83/V84/V85 e separar claramente resultado atual, referência histórica D-N e meta comercial.
4. **Configurações / hardcodes residuais**: concluir centralização de listas e opções.
5. **Migração arquitetural definitiva**: frontend/backend/banco central antes de multiusuário real e automações externas críticas.
6. **Canais de comunicação + WhatsApp**: canais compartilhados/exclusivos, roteamento, templates, logs, deduplicação e automações sobre backend/jobs.
7. **Segurança, LGPD, backup e observabilidade** antes da produção.

## Dados históricos
A precisão da V88 cresce com o tempo. Enquanto não houver 4 agendas comparáveis para determinado contexto/lead time, o sistema deve continuar exibindo `histórico insuficiente`.

# Roadmap saneado após V87.1

## Concluído / retirar como pendência funcional

- V87 — rastreabilidade e recuperação da Fila de Encaixe.
- Indicadores de recuperação da fila (funcionais dentro da V87).
- Obrigatoriedade configurável de campos críticos (base V71–V74).
- Clientes únicos / bookings / serviços separados nas métricas.
- Vagas livres reais baseadas no motor canônico.
- Confirmações pendentes no painel operacional.

## Próximas etapas recomendadas

1. **V88 — Tendência inteligente** usando `agendaFillSnapshots`; sem inventar histórico quando não houver amostra suficiente.
2. **Categorias Dinâmicas + desacoplamento de regras**: CRUD, ordem, ativo/inativo, compatibilidade física, relatórios, DRE e remoção das inferências por nome.
3. **UX estrutural / Agenda / responsividade**: redesign completo desktop-tablet-celular sobre o menu móvel mínimo já corrigido.
4. **Recepção / metas**: separar referência histórica, ritmo D-N, meta comercial e resultado atual.
5. **Migração arquitetural definitiva** antes de automações externas críticas ou multiusuário real.
6. **Canais de comunicação / WhatsApp / automações** sobre backend, fila de jobs, deduplicação, logs e webhooks seguros.
7. **Segurança, LGPD, backup e observabilidade** antes de produção.

## Observação histórica

A coleta D-N começa prospectivamente na V87.1. A V88 deve informar `histórico insuficiente` até existir base comparável, em vez de reconstruir artificialmente períodos anteriores.

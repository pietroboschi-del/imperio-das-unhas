# Auditoria de implementação — V90

## Fonte de verdade
A implementação foi feita diretamente sobre a V89 entregue como fonte de verdade. A V90 não reconstitui o sistema e não substitui os motores consolidados de Agenda, Fila, Capacidade, Financeiro, DRE, Fiscal ou Auditoria.

## Estratégia de compatibilidade
A V90 usa uma estratégia aditiva:
1. reaproveita `systemSettings.formFields` e `systemSettings.optionSets` das V71–V74;
2. cria somente os catálogos residuais necessários;
3. mantém campos textuais legados quando isso evita bloqueio operacional;
4. adiciona IDs estáveis apenas onde há benefício claro de relacionamento, como tags de CRM;
5. não torna status técnicos editáveis.

## Catálogos criados
- `clients.tags`
- `professionals.specialty`
- `agenda.blockReason`
- `agenda.cancellationReason`
- `stock.productGroup`

## Preservações verificadas
- IDs e registros existentes permanecem inalterados.
- Especialidades existentes alimentam o novo catálogo sem serem reescritas.
- Grupos de estoque existentes alimentam o catálogo sem serem reescritos.
- Motivos históricos disponíveis são semeados quando existem.
- Tags usam IDs estáveis e não alteram cadastro base da cliente.
- Cores atuais de profissionais são preservadas antes da retirada da heurística textual.
- DRE, Caixa, comissões e lançamentos financeiros não recebem efeitos derivados da V90.

## Auditoria
Alterações de tags e motivo de cancelamento deixam trilha por meio do motor V64 quando disponível. A auditoria preexistente de cadastro de cliente permanece na cadeia; a V90 acrescenta somente o fato específico de alteração de tags.

## Infraestrutura de testes
Foi identificado que o diretório histórico continha mais de um `*_RUN_CURRENT_REGRESSION.js`, permitindo que runners fossem tratados como suítes e chamassem uns aos outros. A V90 adiciona um runner canônico que exclui qualquer arquivo `*_RUN_CURRENT_REGRESSION.js` da relação de casos e executa somente testes funcionais.

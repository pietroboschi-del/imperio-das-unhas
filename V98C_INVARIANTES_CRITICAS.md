# V98c — Invariantes críticas congeladas

Data do baseline: 29/09/2026  
Fonte operacional: `index.html` preservado da V97/V98b  
Natureza da etapa: **somente testes/contrato; nenhuma regra operacional foi alterada.**

## Objetivo

A V98c cria um gate de caracterização antes da migração de ownership para o backend. Reescrever uma função, trocar armazenamento, separar o monólito ou mover lógica para NestJS não autoriza alterar o resultado funcional sem uma decisão explícita.

## Regras protegidas

| Domínio | Suíte congelada | Verificações | Invariantes principais |
|---|---|---:|---|
| Financeiro / DRE / comissões / gorjetas | V61 | 91 | saldo inicial, ledger sem duplicidade, caixa físico, remuneração, gorjetas, DRE e fatos históricos |
| Agenda operacional | V70 | 28 | disponibilidade, ocupação, janelas livres, clientes/serviços e regras de operação |
| Rateio de combos no DRE | V75 | 75 | conservação, rateio multiunidade, zero-safe, sem dupla alocação e idempotência |
| Fiscal/pagamentos/autoria | V76 | 52 | múltiplos pagamentos, conta mensal, pagamento direto, neutralidade econômica, autoria e auditoria |
| Capacidade física | V77 | 39 | estações compatíveis, sobreposição, combos, multiunidade, edição não bloqueante |
| Alertas de capacidade | V78 | 33 | conflito real, cancelamento/reagendamento, deduplicação, estados e caráter preventivo |
| Fila de encaixe | V79 | 47 | preferência/exigência, janela válida, expiração, contato, booking canônico, neutralidade financeira |
| Matching de oportunidade | V80 matching | 22 | oportunidade, alternativa, proteção contra colisão, sem auto-booking |
| Motor de oportunidade | V80 engine | 47 | preservação do comportamento operacional da fila |
| Regras cruzadas | V86 | 18 | integração de regras entre módulos |
| Rastreabilidade/recuperação da fila | V87 | 64 | cenários obrigatórios e trilha de recuperação |
| Tendência de preenchimento | V88 | 54 | cálculo descritivo de tendência da Agenda |

Total do golden master crítico: **570 verificações**.

Além disso, o gate exige:

- regressão completa: **42/42 suítes e 2.043 assertions**;
- aritmética decimal/cutover: **14 testes**;
- paridade de obrigações profissionais com o motor V97: **8 testes**.

## Política de alteração

`tests_characterization/baseline.json` não pode ser atualizado apenas porque uma implementação nova mudou o resultado. Primeiro deve existir uma decisão funcional explícita, com justificativa e impacto. Somente depois o baseline pode ser revisado conscientemente.

Uma mudança interna que preserve o comportamento deve manter o golden master verde sem alteração do baseline.

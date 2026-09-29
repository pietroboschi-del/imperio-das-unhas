# V93 — Consolidação da Recepção, Metas e Desempenho

## Objetivo
Separar conceitualmente e consolidar visualmente três leituras que existiam em módulos distintos:
- resultado operacional da recepção (V83/V85);
- meta operacional cadastrada pela gestão (V84);
- referência histórica de preenchimento da Agenda (V88).

## Implementado
- Novo painel consolidado em Relatórios > Agenda.
- Resultado do recorte continua usando autoria original e métricas V83/V85.
- Meta operacional continua usando exclusivamente V84.
- Referência histórica continua usando exclusivamente V88, exigindo unidade + dia de atendimento único para comparação contextual.
- Comparação temporal com o período imediatamente anterior de mesma duração, no mesmo escopo de filtros, sem ranking entre usuários.
- Correção semântica visual na Agenda: "Meta do dia" passa a ser apresentada como "Referência histórica"; o algoritmo legado não foi alterado.
- Valor agendado permanece explicitamente comercial/operacional e não é receita reconhecida.

## Não alterado
- Caixa, Financeiro, DRE, comissões e remuneração.
- Motor de disponibilidade, capacidade física, Fila de Encaixe ou V88.
- Regras e persistência das metas V84.
- Autoria original dos bookings V83.

## Migration
- schemaVersion: 93
- migrationId: `v93-reception-goals-performance-consolidation`

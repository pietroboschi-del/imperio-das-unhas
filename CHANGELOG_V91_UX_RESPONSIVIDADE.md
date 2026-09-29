# V91 — UX Estrutural + Responsividade

## Objetivo
Criar uma fundação visual responsiva para PC, tablet e telas móveis sem alterar regras de negócio da V90.

## Mudanças
- novo drawer de navegação móvel reutilizando os mesmos módulos/permissões da navegação desktop;
- seletor de unidade sincronizado no menu móvel;
- barra superior e navegação desktop compactadas para reduzir estouro horizontal;
- subnavegação com rolagem horizontal controlada em telas estreitas;
- modais adaptados a telas móveis, com altura baseada no viewport e alvos de toque maiores;
- tabelas e containers largos mantidos em rolagem interna, sem criar overflow horizontal da página;
- Agenda preserva a grade canônica e passa a exibir orientação de rolagem horizontal no celular;
- coluna de horário da Agenda fica sticky no celular;
- padronização de foco visível e suporte a `prefers-reduced-motion`;
- inputs/selects/textarea recebem dimensões adequadas para toque e evitam zoom indevido em navegadores móveis;
- migration V91 apenas registra a versão; não altera fatos operacionais nem regras financeiras.

## Fora do escopo
- redesenho funcional da Agenda (previsto para etapa específica);
- transformação do arquivo HTML local em aplicação web hospedada;
- backend/banco central/multiusuário real;
- alterações em Caixa, Financeiro, DRE, Fila, Fiscal, comissões ou disponibilidade.

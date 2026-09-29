# Inventário de configurabilidade — pós V90

## Configurável e operacional
- Categorias de serviços (V89).
- Origem de cliente e fonte de aquisição (V71).
- Tags de relacionamento de clientes (V90).
- Campos/opções de Clientes, Agenda, Comandas, Profissionais, Estoque e Financeiro (V71–V74).
- Especialidades de profissionais como catálogo de sugestões (V90).
- Motivos de bloqueio e cancelamento como catálogos de sugestões (V90).
- Grupo de produto de estoque como catálogo de sugestões (V90).
- Unidade de estoque e motivos de inventário/ajuste (V73).
- Categorias permitidas por estação física (V77/V89).

## Semântica protegida
Estes elementos não devem virar listas livres, pois são chaves de comportamento:
- status de booking;
- estados da Fila de Encaixe;
- natureza de lançamentos financeiros;
- status fiscais;
- ações técnicas de auditoria.

É possível futuramente customizar rótulos visuais, mas o código interno deve permanecer estável.

## Hardcodes históricos ainda presentes fisicamente
Existem funções antigas com inferências por palavras como “cabelo”, “manicure”, “alongamento” e semelhantes. Nas versões atuais, funções canônicas posteriores substituem as inferências usadas em runtime para regras de serviços, e a V90 substitui a heurística de cor da Agenda. Recomenda-se removê-las somente em uma futura consolidação, depois de prova adicional de não dependência, para evitar refatoração destrutiva.

## Candidatos para fases futuras
- canais de comunicação e roteamento multi-canal;
- motivos adicionais de operação identificados em uso real;
- recursos físicos genéricos além de “estação”;
- composição configurável de remuneração, após modelagem específica;
- rótulos visuais customizáveis para estados protegidos;
- categorias rápidas de despesa/rotinas administrativas onde ainda houver lista fixa.

# V89 — Configurabilidade Estrutural · Fase 1

## Objetivo
Transformar categorias de serviços em entidades realmente configuráveis sem alterar os motores canônicos já consolidados de Agenda, Fila, Capacidade Física, Relatórios, DRE ou Financeiro.

## Parte 1 — Categorias dinâmicas
- `schemaVersion` atualizado para 89 com migration idempotente `v89-structural-configurability-phase1`.
- IDs existentes preservados; nenhuma categoria histórica é recriada.
- Categoria passa a ter `active`, `order`, `description`, `serviceDefaults` e `configVersion`.
- CRUD seguro em Configurações: criar, editar, ordenar, ativar/desativar.
- Não existe exclusão destrutiva. Categoria em uso pode ser desativada, preservando serviços, estações e histórico.
- Nomes duplicados são bloqueados sem diferenciar maiúsculas/minúsculas.
- Alterações são auditadas como `serviceCategory`.

## Parte 2 — Desacoplamento operacional
- Regras de novos serviços deixam de depender do texto do nome da categoria/serviço.
- `clientArea` e `mustFinishBeforeSameArea` passam a vir de metadados explícitos da categoria quando o serviço ainda não possui regra própria.
- Serviços existentes mantêm seus valores explícitos intactos.
- Capacidade Física V77 continua canônica e usa `allowedCategoryIds`; categoria nova funciona sem alteração do motor.
- Fila V80 continua consumindo serviço/categoria/capacidade canônicos; nenhuma regra duplicada foi criada.
- Relatórios V61+ já consultam `db.categories` dinamicamente; nenhuma reimplementação foi necessária.
- DRE V75 já resolve categoria por ID/snapshot; fórmulas financeiras não foram alteradas.
- Estoque deixa de oferecer categoria inativa em novos vínculos, mas preserva apropriações/famílias históricas que já a utilizam.

## Parte 3 — Governança de configurabilidade
Registro `__imperioV89.configurabilityRegistry` classifica itens em:
- configuráveis;
- semânticas protegidas;
- candidatos futuros.

Isso evita transformar status e naturezas técnicas em opções livres que possam quebrar regras de negócio.

## Impacto financeiro
Nenhum. V89 não altera Caixa, recebíveis, comissão, DRE, formas de pagamento, rateios ou fatos financeiros.

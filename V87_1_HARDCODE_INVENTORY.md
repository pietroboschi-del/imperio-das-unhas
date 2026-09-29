# V87.1 — Inventário inicial de hardcodes relevantes

Este inventário não altera regras nesta versão. Ele identifica pontos que devem ser tratados junto da futura etapa de **Categorias Dinâmicas / Desacoplamento de Regras**.

## Bloqueadores principais para categorias totalmente dinâmicas

- `defaultServiceLeadRule()` ainda infere regra de precedência pelo nome da categoria contendo `along`.
- `serviceCategoryClientDefaults()` ainda infere área/regras pelos textos `along`, `cabelo`, `cílios/cili`, `sobr`, `manicure`, `pedicure/pé`.
- `clientAreaLabel()` utiliza um conjunto fixo de áreas (`hands`, `feet`, `hair`, `face`, `none`). Isso pode continuar como enumeração operacional, mas deve ser separado da categoria comercial.

## Listas configuráveis ainda fixas encontradas

- `originOptions()` mantém `Presencial`, `WhatsApp`, `Telefone`, `Site / Agendamento online` e `Outro` diretamente no código.
- Existem exemplos/dados seed com categorias e serviços atuais. Seeds não são, por si só, regra de negócio; devem permanecer separados da lógica operacional.

## Já dinâmico e preservado

- estações V77 usam `allowedCategoryIds` e listam `db.categories` dinamicamente;
- filtros/relatórios relevantes trabalham majoritariamente com IDs de categoria/serviço;
- não há tipos de estação codificados por categoria.

## Recomendação da próxima etapa de categorias

Não apenas criar CRUD de `db.categories`. A etapa deve mover inferências para atributos explícitos do serviço/recurso, para que novas categorias não dependam do texto do nome.

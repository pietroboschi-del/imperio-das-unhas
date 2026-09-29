# V98b — Testes

## Executados neste ambiente

- Backend V95–V97 contracts: 108 verificações — aprovado.
- V98a reconciliação/import/cutover/dinheiro: 110 verificações — aprovado.
- V98b segurança/permissões/3 unidades: 53 assertions — aprovado.
- Frontend V97 completo: 42/42 suítes, 2.043 assertions — aprovado.
- TypeScript: 41 arquivos transpilados para validação sintática, 0 erros — aprovado.
- Gateway fiscal: 3/3 testes — aprovado.

## Teste V98b preparado para CI real

`backend/test/v98b-security.integration.mjs` valida com PostgreSQL/Nest:

- login do dono;
- criação de usuário pelo endpoint administrativo;
- garantia de `networkAdmin=false`;
- emissão/consumo de convite;
- login após ativação;
- recuperação de CSRF;
- acesso permitido/negado entre as três unidades;
- permissão funcional distinta por unidade;
- bloqueio de importação para operador;
- ausência de `legacyPayload` na API de cliente;
- OpenAPI;
- rate limit de login.

## Gate pendente

Ainda não executado neste host: `npm install`, Prisma generate/migrate, build do NestJS e testes de integração reais, por indisponibilidade de rede npm/PostgreSQL local e ausência do repositório no conector GitHub.

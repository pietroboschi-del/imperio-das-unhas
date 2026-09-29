# Changelog — V98c Caracterização de Regras Críticas

## Escopo

Checkpoint de segurança de migração. Nenhuma funcionalidade do salão, regra financeira ou comportamento de interface foi alterado.

## Implementado

- `tests_characterization/baseline.json`: baseline versionado com SHA-256 dos testes críticos e de suas saídas canônicas.
- `tests_characterization/run-characterization-gate.mjs`: executor independente de dependências externas.
- `tests_characterization/README.md`: política de manutenção do golden master.
- `V98C_INVARIANTES_CRITICAS.md`: mapa das regras protegidas.
- `backend/package.json`: comando `npm run test:characterization`.
- `.github/workflows/backend-ci.yml`: o CI agora exige o gate de caracterização antes dos testes PostgreSQL/Nest.

## Resultado

O baseline foi criado a partir do comportamento já aprovado da V97/V98b e passou integralmente no momento da criação.

## Não feito nesta etapa

- nenhuma alteração em `index.html`;
- nenhuma alteração de schema Prisma;
- nenhuma alteração em regras de Agenda/Financeiro/Comissões/Fila;
- nenhuma exportação de dados reais das unidades;
- nenhuma homologação PostgreSQL, que continua dependendo do ambiente externo/CI.

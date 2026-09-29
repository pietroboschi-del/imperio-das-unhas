# Império das Unhas — Backend V98b

Backend em homologação para migração progressiva do sistema local para PostgreSQL. **A V98b ainda não habilita escrita operacional remota.**

## V98a preservada

- reconciliação multi-export;
- SHA-256 e revisão monotônica;
- staging em lote e retenção;
- normalização do estado vigente da DEC-011;
- promoção atômica + conferência de cutover;
- testes reais PostgreSQL/Nest preparados no CI.

## V98b

- autorização deny-by-default;
- `networkAdmin` separado de `allUnits`;
- `SystemRole` separado de escopo/permissões;
- permissões funcionais server-side;
- administração de usuários somente pelo dono;
- ativação/reset com token de uso único;
- rate limit persistente no PostgreSQL;
- recuperação de CSRF;
- DTOs seguros sem `legacyPayload` nas APIs Core;
- OpenAPI sob `OPENAPI_ENABLED`;
- teste de segurança para as três unidades preparado para CI.

## Inicialização de homologação

1. Copie `.env.example` para `.env`.
2. Ajuste `DATABASE_URL`, CORS e segredos do ambiente.
3. `npm install`
4. `npm run prisma:generate`
5. `npm run prisma:migrate`
6. Defina `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_NAME` e execute `npm run admin:create`.
7. `npm run build`
8. `npm start`
9. Execute `npm test`.
10. Em banco de homologação, execute `npm run test:integration` e `npm run test:security-integration`.

## Regra de cutover

Nenhum módulo deve passar a escrever operacionalmente no PostgreSQL antes de:

- CI/runtime real aprovado;
- reconciliação dos três exports reais;
- conferência do estado vigente por unidade;
- autorização e concorrência testadas no módulo correspondente.

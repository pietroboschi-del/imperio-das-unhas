# Império das Unhas — Backend V97

Backend em homologação para a migração progressiva do sistema local para PostgreSQL. **A V97 ainda não habilita escrita operacional remota.**

## V97
A V97 acrescenta read-through verificado:
- `READ_THROUGH_ENABLED=false` por padrão;
- snapshot exato (`instanceId` + `revision` + `dataHash`) obrigatório;
- Serviços/Categorias disponíveis para read-through controlado;
- Profissionais/Clientes/Bookings disponíveis apenas em preview por unidade/data;
- se `OPERATIONAL_WRITES_ENABLED=true`, o módulo V97 bloqueia a leitura operacional por segurança.

## Inicialização de homologação
1. Copie `.env.example` para `.env`.
2. Ajuste `DATABASE_URL`, CORS e segredos do ambiente.
3. `npm install`
4. `npm run prisma:generate`
5. `npm run prisma:migrate`
6. Crie um administrador de homologação.
7. Suba o backend.
8. Importe um envelope atual em dry-run e depois commit controlado.
9. Valide V96 shadow.
10. Só então habilite `READ_THROUGH_ENABLED=true`.

## Testes de contrato
- `npm run test:contract`
- `npm run test:shadow`
- `npm run test:readthrough`

Nunca habilite escrita operacional remota antes do cutover formal e dos testes de concorrência, backup, auditoria e autorização.

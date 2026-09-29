# V98b — Segurança e Contrato

Data: 29/09/2026
Base: checkpoint V98a `f583e5a`

## Escopo implementado

- autorização deny-by-default para toda rota não pública;
- separação entre `networkAdmin`, `systemRole`, escopo de unidades e permissões funcionais;
- importação legada nunca promove `allUnits` para `networkAdmin`;
- `allUnits` passa apenas a conceder vínculo às unidades existentes;
- mapeamento conservador das permissões V67 para permissões backend;
- conta do dono (`networkAdmin=true`, `SystemRole.OWNER`) criada somente pelo bootstrap administrativo;
- administração server-side de usuários pelo dono, sem endpoint capaz de promover outro usuário a `networkAdmin`;
- ativação e redefinição por token aleatório de uso único, persistido somente como SHA-256;
- tokens anteriores invalidados, sessões revogadas após redefinição;
- rate limit persistente de login por IP e combinação usuário/IP;
- recuperação/rotação de CSRF com sessão existente;
- DTOs/selects explícitos nas leituras Core; `legacyPayload` não é retornado nessas APIs;
- DEC-004 aplicada: cadastro de cliente é de rede; unidade atual autoriza o operador, mas não restringe a busca do cadastro;
- Read-through e Shadow legados restritos ao administrador de rede;
- OpenAPI/Swagger preparado e desligado por padrão;
- CI ampliado para executar teste de segurança V98b com PostgreSQL/Nest reais.

## Sem alteração

- `index.html` operacional permanece V97 e não foi modificado funcionalmente;
- regras de Agenda, Caixa, Financeiro, DRE, Estoque, comissão e Fiscal não foram reescritas;
- `OPERATIONAL_WRITES_ENABLED` continua falso no fluxo de homologação.

## Limitação de homologação

O ambiente atual não acessa `registry.npmjs.org` e o repositório GitHub ainda não aparece para o conector. Assim, `npm install`, Prisma generate/migrate, build Nest e os testes PostgreSQL/Nest reais continuam pendentes de execução externa. O workflow e os testes de integração estão prontos para esse gate.

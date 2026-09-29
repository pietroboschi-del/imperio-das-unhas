# Testes — V95

## Regressão completa do sistema local
- 40/40 suítes aprovadas.
- 1.941/1.941 assertions aprovadas.
- 0 falhas.

## V95 específico
- 41 verificações integradas ao release.
- schema/migration V95.
- fonte operacional local explícita.
- comunicação remota operacional desligada.
- envelope V95 compatível com contrato V94 e credenciais redigidas.
- presença/estrutura do backend no pacote.
- rotas operacionais somente leitura.
- importação dry-run/flag de commit.
- sessão segura/RBAC por unidade.
- reabertura idempotente.

## Contrato backend independente
- 35 verificações.
- modelos Prisma essenciais.
- sessão em hash.
- Argon2.
- CSRF.
- escopo por unidade.
- staging/importação.
- API operacional sem mutações.
- rejeição de envelope adulterado ou com segredo em claro.

## Sintaxe
- HTML: 59/59 blocos JavaScript aprovados por `node --check`.
- Backend: 28/28 arquivos TypeScript transpilaram sem erro sintático.

## Gateway fiscal
- 3/3 testes aprovados.

## Observação
Não houve instalação de dependências externas do novo backend neste ambiente; compilação NestJS/Prisma e banco real ficam para a homologação, mantendo a V95 sem efeito na operação existente.

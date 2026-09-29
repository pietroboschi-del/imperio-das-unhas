# V97 — Read-through Controlado

## Objetivo
Dar o primeiro passo de leitura operacional do backend sem trocar a fonte de verdade e sem habilitar escrita remota.

## Escopo operacional
- Serviços e Categorias podem ser renderizados pelo backend somente quando o recurso for habilitado na sessão.
- O backend exige envelope importado com `instanceId`, `revision` e `dataHash` exatamente iguais ao estado local.
- O frontend valida novamente contagem e fingerprint de Categorias/Serviços antes de usar o retorno.
- Qualquer divergência, indisponibilidade, perda de sessão ou alteração local provoca fallback automático para o banco local.
- O dado remoto é usado apenas como overlay de renderização; `db.services` e `db.categories` locais não são substituídos persistentemente.

## Preview apenas
Profissionais, Clientes e Bookings podem ser consultados no endpoint de preview por unidade/data, com RBAC server-side, mas ainda não alimentam a Agenda operacional.

## Segurança
- `READ_THROUGH_ENABLED=false` por padrão.
- `OPERATIONAL_WRITES_ENABLED=false` continua obrigatório; o serviço V97 se recusa a operar se writes remotos estiverem ligados.
- Headers de snapshot foram adicionados ao CORS: `X-Imperio-Instance-Id`, `X-Imperio-Revision`, `X-Imperio-Data-Hash`.
- O toggle de read-through usa apenas `sessionStorage`, não altera a revisão local.

## Backend
Novo módulo `src/read-through/` com:
- `GET /api/v1/read-through/status`
- `GET /api/v1/read-through/catalog`
- `GET /api/v1/read-through/unit-preview?date=YYYY-MM-DD`

## Sem impacto
Nenhuma regra de Agenda, Caixa, Financeiro, DRE, comissões, Fiscal, Estoque, Fila ou capacidade física foi alterada.

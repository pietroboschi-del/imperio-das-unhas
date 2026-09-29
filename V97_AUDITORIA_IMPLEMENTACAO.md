# V97 — Auditoria de Implementação

## Fonte
V96 — Homologação + Leitura em Sombra.

## Decisões de segurança
1. Local continua fonte de verdade e fallback.
2. Escrita remota permanece bloqueada.
3. O read-through exige snapshot exato do banco inteiro, não apenas do catálogo.
4. O catálogo remoto é validado por fingerprint após a validação do envelope.
5. Uma alteração local invalida imediatamente o cache remoto porque muda a revisão/hash.
6. Não existe persistência do toggle no banco; é uma opção da sessão.
7. Profissionais/Clientes/Agenda permanecem apenas em preview.

## Risco evitado
A V97 não introduz sincronização bidirecional. Isso evita conflito local × servidor enquanto o backend ainda está em homologação.

## CORS
A auditoria encontrou e corrigiu a ausência dos headers `X-Imperio-*` na allowlist CORS do NestJS. Sem isso, o browser bloquearia o read-through apesar dos testes de lógica passarem.

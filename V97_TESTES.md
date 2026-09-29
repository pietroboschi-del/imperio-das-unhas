# V97 — Testes

- Regressão completa: 42/42 suítes, 2.043 assertions, 0 falhas.
- Suíte específica V97: 44 assertions.
- Contrato backend V97: 22 assertions.
- Preservação contrato backend V96: 50 assertions.
- Preservação contrato backend V95: 35 assertions.
- Gateway fiscal: 3/3 testes.
- HTML: 61 blocos JavaScript, todos com `node --check` aprovado.
- Backend: 34 arquivos TypeScript analisados sintaticamente sem erro.

## Cobertura V97
- schema/migration idempotente;
- writes remotos desativados;
- read-through desativado por padrão;
- toggle apenas em sessionStorage;
- headers de snapshot;
- fingerprints do catálogo;
- invalidação após mudança de revisão;
- neutralidade financeira;
- contrato backend e UnitScoped;
- fallback local explícito.

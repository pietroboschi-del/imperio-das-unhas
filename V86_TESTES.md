# V86 — Evidência de testes

## Pré-auditoria
Todos os 110 arquivos históricos existentes foram executados antes de correções.
- 7 passaram.
- 103 interromperam por asserts estruturais/versionados obsoletos (principalmente contagem literal de scripts).
- Os arquivos históricos foram preservados sem alteração.
- Evidência: `V86_PRE_AUDIT_EXISTING_TESTS_SUMMARY.txt` e `V86_PRE_AUDIT_EXISTING_TESTS_FULL.log`.

## Regressão atual
`tests_v86_current/V86_RUN_CURRENT_REGRESSION.js`
- 30/30 suítes.
- 1.475/1.475 assertions.
- Resultado serializado em `V86_REGRESSION_CURRENT_RESULT.json`.

## Gateway fiscal
`npm test` em `fiscal-gateway`:
- 3/3 testes.

## UI
- 49/49 scripts sintaticamente válidos.
- 49 tags `<script>` e 49 `</script>`.
- 17 IDs estáticos, 0 duplicados.
- 0 vazamentos de tokens JavaScript no conteúdo estático visível.
- Testes DOM simulados para Relatórios/painel e templates.
- Chromium headless foi tentado, mas não concluiu no ambiente; não é contabilizado como E2E aprovado.

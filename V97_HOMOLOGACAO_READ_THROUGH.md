# Como homologar o Read-through V97

1. Suba PostgreSQL e backend a partir de `backend/`.
2. Mantenha `OPERATIONAL_WRITES_ENABLED=false`.
3. Ative `MIGRATION_IMPORT_ENABLED=true` somente no ambiente de homologação durante a importação controlada.
4. Exporte um envelope V97 do sistema local e importe-o.
5. Defina `SHADOW_READS_ENABLED=true` e valide staging/unidade pela V96.
6. Defina `READ_THROUGH_ENABLED=true`.
7. Na mesma aba do navegador, autentique no backend pela área Arquitetura.
8. Ative o read-through V97 e teste o catálogo.
9. Confirme em Serviços o indicador `Backend verificado`.
10. Faça uma alteração local: a próxima leitura deve voltar para `Local · fallback` até nova importação exata.

Não habilite `OPERATIONAL_WRITES_ENABLED` nesta fase.

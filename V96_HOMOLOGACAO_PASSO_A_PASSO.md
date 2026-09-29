# V96 — Procedimento de homologação real

1. Copiar `backend/.env.example` para `backend/.env` e trocar todas as credenciais padrão.
2. Subir PostgreSQL com `docker compose up -d postgres`.
3. Instalar dependências com `npm install`.
4. Executar `npm run prisma:generate`.
5. Executar `npm run prisma:migrate`.
6. Criar o primeiro administrador backend com o script `admin:create`.
7. No HTML V96, gerar o envelope sanitizado.
8. Validar o envelope e executar dry-run.
9. Habilitar `MIGRATION_IMPORT_ENABLED=true` somente para importar a cópia em homologação.
10. Desabilitar novamente a flag de importação.
11. Habilitar `SHADOW_READS_ENABLED=true`.
12. Em Configurações > Arquitetura, informar a URL do backend de homologação, autenticar e executar “Comparar staging”.
13. Exigir `eligibleForShadowRead=true` e todas as coleções equivalentes.
14. Comparar cada uma das três unidades e datas representativas pelo manifesto de unidade.
15. Executar testes de autorização com usuários restritos a cada unidade.
16. Manter `OPERATIONAL_WRITES_ENABLED=false` durante toda a V96.

Nenhum cutover deve ocorrer com divergências abertas.

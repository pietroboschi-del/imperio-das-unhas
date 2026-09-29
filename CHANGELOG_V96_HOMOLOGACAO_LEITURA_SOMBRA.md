# V96 — Homologação + Leitura em Sombra

## Objetivo
Preparar e validar a transição da fonte local para PostgreSQL sem cutover operacional.

## Implementações
- `schemaVersion = 96` e migration `v96-shadow-read-homologation`.
- Frontend mantém leitura/escrita operacional remota desativadas.
- Painel manual em Configurações > Arquitetura para saúde, login de homologação, comparação de staging e comparação por unidade/data.
- Probe local sanitizado com contagens e fingerprints por coleção.
- Manifesto de unidade/data com fingerprints canônicos para tolerar reordenação de chaves JSONB.
- Backend `ShadowModule` com status, comparação do envelope importado e manifesto por unidade.
- `SHADOW_READS_ENABLED=false` por padrão.
- `ClientUnitLink` para derivar presença real do cliente por unidade a partir de cadastro e bookings.
- Reimportação recalcula vínculos cliente/unidade, profissional/unidade e RBAC por unidade.
- Reimportação de envelope não apaga senha backend já redefinida.
- Migration SQL inicial versionada para PostgreSQL limpo.

## O que NÃO mudou
- Agenda, Fila, Financeiro, Caixa, DRE, comissão, Estoque e Fiscal continuam usando a fonte local.
- Nenhuma escrita operacional remota foi habilitada.
- Resultados da leitura em sombra não alimentam telas operacionais.

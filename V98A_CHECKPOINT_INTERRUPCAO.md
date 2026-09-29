# V98a — Checkpoint consolidado após interrupção

Data: 29/09/2026
Base operacional preservada: V97 (`index.html`, schema frontend 97)
Backend em preparação: `imperio-backend-v98a` 0.98.0

## Regra deste checkpoint

As novas implementações foram interrompidas a pedido do dono. Este checkpoint consolida somente o que já havia sido implementado até o ponto da interrupção e finaliza apenas a consistência necessária para deixar o projeto íntegro. Nenhuma nova funcionalidade foi adicionada após o pedido de parada.

## Implementações já concluídas e preservadas

1. Fundação de CI para backend com PostgreSQL de serviço em GitHub Actions.
2. Limite explícito de body JSON/urlencoded (`JSON_BODY_LIMIT`, padrão 20 MB).
3. Motor de reconciliação multi-export para as até 3 bases legadas, incluindo:
   - validação de `dataMode`;
   - SHA-256 canônico com compatibilidade de leitura de FNV legado;
   - divergência por coleção/ID;
   - registros exclusivos/conflitantes;
   - detecção de possíveis clientes duplicados sem merge automático;
   - comparação de estoque por produto/local;
   - detecção de seções/configurações divergentes.
4. Contrato de snapshot canônico (`CANONICAL_RECONCILED`) e `reconciliationId`.
5. Revisão monotônica por `instanceId`; mesma revisão não pode receber outro conteúdo.
6. Staging em lote (`createMany`) e retenção configurável com purge.
7. Hash de integridade SHA-256 no backend; FNV mantido apenas para compatibilidade de envelopes antigos.
8. Projeção do estado operacional vigente da DEC-011:
   - agendamentos futuros;
   - fila de encaixe ativa;
   - comandas abertas;
   - créditos de clientes;
   - pacotes com saldo;
   - recebíveis em aberto;
   - estoque de abertura por item/local;
   - comissões/gorjetas pendentes;
   - fiscal pendente/em processamento.
9. Modelos PostgreSQL normalizados para saldos/estado de abertura.
10. Gate automático de conferência do cutover, inclusive por unidade e estoque item × local.
11. Evidência de conferência persistida em `MigrationEnvelope` e endpoint de relatório.
12. Aritmética decimal de migração sem float para valores monetários, reproduzindo a regra histórica de arredondamento V97 inclusive para valores negativos.
13. Extração de saldo profissional usando o motor vencedor V97 (`__imperioV61.v61ProfessionalObligations`) como oráculo de migração; reconstrução incerta bloqueia cutover.
14. Timezone operacional explícito por unidade, padrão `America/Sao_Paulo`; `serviceDate` segue como data civil.
15. Reconciliação de snapshot normalizado para impedir registros antigos permanecerem ativos por acidente.
16. Promoção atômica da importação: normalização + conferência de cutover + marcação `IMPORTED` ocorrem na mesma transação PostgreSQL; falha faz rollback da promoção e registra a tentativa como `FAILED`.
17. Frontend V97 preservado byte a byte, sem alteração funcional.

## Última implementação efetivamente concluída

A última implementação consolidada foi a **promoção atômica da importação**: o staging continua disponível para diagnóstico, mas nenhuma alteração normalizada pode ficar parcialmente aplicada se a conferência final falhar. A transação de promoção usa `MIGRATION_PROMOTION_TX_TIMEOUT_MS` e, em caso de erro, o envelope é marcado como `FAILED` fora da transação revertida.

## Limitação do ambiente

Este ambiente não possui PostgreSQL/`psql`/Docker nem `node_modules` instalados. Por isso não foi possível executar aqui:

- `npm install` real do backend;
- `prisma generate`;
- `prisma migrate deploy` contra PostgreSQL;
- build NestJS com dependências reais;
- teste HTTP/PostgreSQL `v98a-postgres.integration.mjs`.

Esses gates estão configurados no CI e permanecem **pendentes de execução real**. O checkpoint não declara o backend PostgreSQL homologado.

## Tarefas pendentes após este checkpoint

### V98a — ainda pendente de validação/execução real

1. Executar CI com PostgreSQL real e dependências instaladas.
2. Validar Prisma schema e todas as migrations com `prisma generate/migrate`.
3. Executar `v98a-postgres.integration.mjs`, incluindo body >100 KB, monotonicidade, idempotência, reconciliação de booking removido e rollback atômico.
4. Coletar os 3 exports reais e executar a reconciliação multi-export.
5. Revisar manualmente conflitos e duplicidades; gerar snapshot canônico aprovado.
6. Decidir se haverá histórico mínimo de atendimentos (A3).
7. Executar cutover/reconciliação com dados reais e conferência por unidade.

### V98b — não iniciada neste checkpoint

- separar `networkAdmin` de `allUnits`;
- autorização deny-by-default;
- aplicar permissões funcionais no backend;
- ativação/redefinição de senha;
- rate limit;
- DTOs de saída e redução de `legacyPayload` exposto;
- OpenAPI;
- hardening de CSRF/autorização entre as 3 unidades;
- política definitiva para integrações e dados sensíveis.

### Pós-V98

A migração por ownership de módulos (Identidade/Unidades → Catálogo → Profissionais → Clientes → Agenda) permanece pendente. O read-through global por hash da V97 não deve ser expandido como arquitetura definitiva.

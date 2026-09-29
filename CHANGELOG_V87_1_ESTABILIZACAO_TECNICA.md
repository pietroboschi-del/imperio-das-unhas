# V87.1 — Estabilização Técnica

## Objetivo
Preparar a V87 para as próximas implementações sem alterar regras financeiras, sem implementar ainda a V88 e sem consumir `schemaVersion = 88`.

## Alterações

1. **Snapshots prospectivos da Agenda**
   - nova coleção `agendaFillSnapshots`;
   - checkpoints D-0, D-1, D-3, D-7, D-14 e D-30;
   - usa `__imperioV62.agendaMetricsCanonical` como fonte canônica;
   - nenhuma reconstrução retroativa fictícia;
   - uma chave por unidade + data alvo + data de observação;
   - reabertura idempotente: sem nova escrita quando os valores materiais não mudaram.

2. **Barramento interno de eventos**
   - API `window.__imperioEvents` com `on`, `off`, `emit` e `listenerCount`;
   - o gateway de persistência emite `agenda.changed` quando o fingerprint operacional da Agenda muda;
   - objetivo: reduzir o crescimento futuro de cadeias de wrappers e criar uma rota limpa para V88, CRM, WhatsApp e automações.

3. **Gateway de persistência / fluidez**
   - preserva o `save()` existente;
   - quando o backoffice está ativo, não força `renderPublic()` desnecessariamente;
   - mantém o comportamento de renderização pública quando o site público está visível;
   - mantém verificação de gravação e proteção de armazenamento anteriores.

4. **Diagnóstico de integridade**
   - `__imperioV871.integrity()` verifica IDs duplicados e referências órfãs relevantes em Agenda, serviços, profissionais, unidades, fila, oportunidades, estações e snapshots;
   - diagnóstico não corrige nem apaga dados automaticamente.

5. **Navegação móvel mínima operacional**
   - a V87 ocultava `.admin-tabs` abaixo de 800 px sem substituto;
   - adicionado botão `☰ Menu` para reutilizar os mesmos módulos e unidade da navegação principal;
   - é uma correção estrutural de acesso, não o redesign final responsivo.

6. **Logo ausente — fallback seguro**
   - o pacote continua sem o logo oficial fornecido pelo usuário;
   - imagens `assets/logo.png` recebem fallback textual `IU` apenas se o asset falhar;
   - a identidade visual definitiva permanece pendente e não foi inventada.

## Versionamento

- Release: `V87.1`.
- `schemaVersion`: **87**, intencionalmente.
- Migration adicional: `v87-1-technical-stabilization`.
- `schemaVersion = 88` fica reservado à V88 — Tendência Inteligente.

## Neutralidade

A V87.1 não altera Caixa, Financeiro, DRE, comissão, recebíveis ou regras comerciais.

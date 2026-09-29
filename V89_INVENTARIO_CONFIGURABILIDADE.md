# V89 — Inventário de Configurabilidade

## Princípio
Nem todo hardcode é um defeito. O sistema diferencia:
1. **Configurável** — gestão pode criar/editar/ativar sem código.
2. **Semântica protegida** — rótulo pode evoluir, mas o código interno deve permanecer estável.
3. **Candidato futuro** — ainda existe acoplamento ou lista fixa que merece evolução posterior.

## Configuráveis já existentes / consolidados
| Domínio | Estado | Fonte canônica |
|---|---|---|
| Categorias de serviços | V89 concluído | `db.categories` + `__imperioV89` |
| Origem do cliente | Já configurável | `systemSettings.optionSets['clients.origin']` |
| Como conheceu / aquisição | Já configurável | `clients.source` + sincronismo com `db.acquisitionSources` |
| Campos de Clientes | Já configurável | V71 |
| Campos/opções Agenda e Comandas | Já configurável em grande parte | V72 |
| Profissionais e Estoque | Já configurável em grande parte | V73 |
| Financeiro | Já configurável em grande parte | V74 |
| Unidade normalizada de estoque | Já configurável | `stock.baseUnit` |
| Motivo de inventário | Já configurável | `stock.inventoryReason` |
| Compatibilidade estação × categoria | Dinâmica | V77 `allowedCategoryIds` |

## Semânticas protegidas
Esses valores não devem virar texto livre porque motores dependem do significado interno:
- estados de booking (ex.: cancelado, faltou, bloqueado);
- estados da Fila de Encaixe e das oportunidades;
- estados/documentos fiscais;
- ações da Auditoria;
- naturezas financeiras/contábeis que determinam impacto no Caixa/DRE.

Regra futura: quando houver necessidade de personalização visual, separar **código interno imutável** de **rótulo apresentado**.

## Candidatos futuros relevantes
### 1. Cores da Agenda por especialidade
`defaultAgendaColor()` ainda usa palavras da especialidade para escolher cor. É apenas visual, não altera disponibilidade. Futuro recomendado: cor configurável por profissional/categoria, com fallback neutro.

### 2. Categorias rápidas de sangria/despesa
Existe uma lista visual histórica em um fluxo antigo de Caixa. Antes de alterar, deve-se confirmar qual wrapper V74 prevalece e consolidar a fonte em `financeCategories`/option set sem mudar a natureza contábil.

### 3. Canais de comunicação
A configuração atual de WhatsApp por unidade não representa adequadamente canal compartilhado, canal exclusivo e canal de leads. Futuro: entidade `CommunicationChannel` + regras de roteamento.

### 4. Composição de remuneração
Os motores atuais são estáveis e não devem ser generalizados nesta fase. Futuro: avaliar composição de regras sem perder snapshots e cálculo histórico.

### 5. Recursos físicos genéricos
V77 trabalha com estações e categorias. Futuro: evoluir cuidadosamente para recursos (sala, maca, lavatório, equipamento), mantendo estação como um tipo de recurso e sem quebrar o matching atual.

## Heurísticas legadas por nome
O arquivo preserva funções históricas anteriores por compatibilidade/auditoria de versões, mas a V89 instala no runtime as implementações canônicas que usam **metadados explícitos**, não o nome de categoria/serviço, para `clientArea` e sequência na mesma área.

Não foi removido código histórico nesta fase para reduzir risco de regressão. A consolidação física do monólito deve ocorrer em etapa técnica separada e coberta por testes.

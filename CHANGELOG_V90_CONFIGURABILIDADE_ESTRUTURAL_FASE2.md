# V90 — Configurabilidade Estrutural · Fase 2

## Objetivo
Expandir a configurabilidade operacional iniciada nas V71–V74 e V89 sem reescrever motores canônicos estáveis e sem flexibilizar estados técnicos cuja semântica é necessária para Agenda, Fila, Financeiro, Fiscal e Auditoria.

## Implementado

### CRM / Clientes
- Novo catálogo `clients.tags` para tags de relacionamento.
- Tags persistidas por IDs estáveis em `client.tagIds`.
- Seleção no formulário completo da cliente.
- Exibição no resumo do perfil.
- Filtro por tag na lista de Clientes.
- Opções administradas pelo motor já existente de Campos e Opções.
- Tags inativas permanecem visíveis em clientes históricos que já as possuem.

### Profissionais
- Novo catálogo `professionals.specialty`.
- O campo de especialidade continua textual para compatibilidade e passa a receber sugestões por `datalist`.
- Valores históricos são semeados automaticamente no catálogo.
- O catálogo é não bloqueante por padrão: uma especialidade histórica não deixa de ser utilizável apenas por não estar na lista.

### Agenda
- Novo catálogo `agenda.blockReason` para motivos de bloqueio.
- Novo catálogo `agenda.cancellationReason` para motivos de cancelamento.
- Motivos são sugestões configuráveis; continuam não bloqueantes por padrão.
- Se a Administração marcar o campo como obrigatório, a validação passa a exigir preenchimento.
- `booking.cancellationReason` é persistido e auditado sem alterar o status técnico `Cancelado`.

### Estoque
- Novo catálogo `stock.productGroup` para grupos de produtos.
- O campo permanece textual, recebendo sugestões configuráveis e preservando valores históricos.

### Agenda — desacoplamento residual
- A cor visual padrão de Agenda deixa de depender do texto de `specialty` para novos registros.
- Cores já utilizadas por profissionais existentes são congeladas na migration para preservar a aparência atual.
- Novos profissionais sem cor explícita recebem uma cor neutra canônica.

### Governança
- Estados técnicos permanecem protegidos: `booking.status`, `waitlist.status`, `finance.entryNature`, `fiscal.status`.
- A migration é aditiva e não destrutiva.
- Nenhuma regra financeira foi alterada.

## Migration
- `schemaVersion`: 90
- ID: `v90-structural-configurability-phase2`
- A migration é idempotente e não recria registros históricos.

## Testes
- Regressão atual: 35/35 suítes, 1.713 assertions, 0 falhas.
- V90 específica: 37 verificações.
- Gateway fiscal: 3/3 testes.
- 54 blocos JavaScript validados por `node --check`.

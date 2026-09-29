# V87 — Evidência de testes

## Auditoria prévia da V86
- Suítes: **30/30**
- Assertions: **1.475/1.475**
- Falhas: **0**

## Regressão final V87
- Suítes: **31/31**
- Assertions: **1.540/1.540**
- Falhas: **0**
- Teste específico V87: **56 assertions**, cobrindo os 18 cenários obrigatórios e verificações adversariais adicionais.

## Cenários V87 cobertos
1. Cancelamento → oportunidade → booking recuperado.
2. Cancelamento → recusa, sem recuperação.
3. Oportunidade perdida → invalidada.
4. Reagendamento → origem RESCHEDULE.
5. Desbloqueio → origem UNBLOCK.
6. Vaga pré-existente → EXISTING_AVAILABILITY.
7. PREFERRED + preferida → IDEAL.
8. PREFERRED + outra habilitada → ALTERNATIVE.
9. REQUIRED rejeita outra profissional.
10. Capacidade física gera warning e não bloqueia.
11. Contato sem booking não recupera.
12. Booking real vincula request → opportunity → booking e congela valor comercial.
13. Booking posteriormente cancelado preserva conversão e zera valor recuperado atual.
14. Duas oportunidades distintas do mesmo request ficam preservadas.
15. Reavaliação repetida não duplica oportunidade.
16. Multiunidade respeita escopo do usuário.
17. Fila/conversão não alteram arrays financeiros.
18. Combo 40 + 40 com preço 65 recupera 65.

Adicionais:
- oportunidade ativa anterior à V87 é `UNKNOWN_LEGACY`, sem origem inventada;
- alteração cosmética de profissional não é tratada como mudança de disponibilidade;
- alteração real de escala é detectada;
- alteração apenas de preço do serviço não é origem de disponibilidade;
- alteração de duração é relevante;
- cancelamento não relacionado à faixa encontrada não é falsamente atribuído como origem.

## Estrutural/UI
- **50/50** blocos JavaScript passam `node --check`.
- `<script>`: 50 aberturas / 50 fechamentos.
- IDs HTML estáticos: 17; duplicados: **0**.
- `evaluatePhysicalCapacity()` possui **1 definição canônica**.
- `DOMContentLoaded`: 0 duplicações.
- `addEventListener(` bruto: 1 histórico; a V87 não adiciona listener novo.
- inspeção de texto visível: nenhuma ocorrência de `window.`, `addEventListener`, `=>`, `function `, `const `, `let ` ou `${` vazando para a UI.

## Gateway fiscal
- **3/3** testes aprovados.

## Observação
A validação automatizada é Node/vm + DOM simulado e testes do gateway. Não foi declarada execução E2E completa em navegador real.

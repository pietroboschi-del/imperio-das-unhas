# Gate de caracterização V98c

Este diretório congela o comportamento crítico observado na V97/V98b antes da migração de ownership para o backend.

O gate **não adiciona nem altera regra operacional**. Ele executa as suítes já existentes contra `index.html`, valida a quantidade de assertions e compara a saída canônica com um golden master SHA-256. Também exige que os próprios testes críticos permaneçam inalterados, para evitar que uma regressão seja escondida pela edição do teste.

## Executar

```bash
node tests_characterization/run-characterization-gate.mjs
```

O gate também executa a regressão completa (42 suítes / 2.043 assertions) e duas paridades de backend que não dependem de PostgreSQL: dinheiro decimal e obrigações profissionais derivadas do motor V97.

## Regra para próximas versões

Uma implementação nova pode substituir código interno, mas não deve atualizar `baseline.json` apenas para fazer o teste passar. Qualquer mudança do golden master precisa ser uma decisão funcional explícita, documentada e revisada antes de alterar este baseline.

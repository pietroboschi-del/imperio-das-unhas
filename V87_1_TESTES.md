# V87.1 — Testes finais

## Regressão completa

- Suítes: **32/32**
- Assertions: **1.564/1.564**
- Falhas: **0**

Inclui todas as suítes correntes da V87 e uma suíte específica V87.1 com 22 verificações.

## Suíte V87.1

Valida, entre outros:

- `schemaVersion` continua 87;
- migration V87.1 é única;
- registro único de `agendaFillSnapshots` no registry;
- snapshots D-N são prospectivos;
- recaptura do mesmo dia não duplica registros;
- alteração operacional emite `agenda.changed`;
- snapshots não crescem a cada save sem mudança material;
- diagnóstico encontra ID duplicado e referências órfãs críticas;
- menu móvel está presente e ativo abaixo de 800 px;
- V87.1 não adiciona listeners DOM paralelos;
- neutralidade financeira explícita.

## JavaScript estático

- 51 aberturas `<script>`;
- 51 fechamentos `</script>`;
- 51 blocos parseados;
- todos compilam sem erro de sintaxe.

## Gateway fiscal

- 3/3 testes aprovados;
- produção continua bloqueada por padrão;
- divergência de ambiente continua bloqueada no servidor.

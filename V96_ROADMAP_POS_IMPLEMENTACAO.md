# Pós-V96

## Bloqueadores antes da próxima virada
- Executar V96 contra PostgreSQL real em ambiente de homologação.
- Confirmar migration Prisma/SQL.
- Importar envelope real sanitizado e obter equivalência total do staging.
- Validar manifestos nas três unidades.
- Testar autorização horizontal e vertical.

## Próxima evolução após homologação aprovada
A próxima etapa deve habilitar **read-through controlado** para um conjunto pequeno de telas não financeiras, mantendo comparação dupla e fallback local. Escrita remota deve continuar bloqueada até existir idempotência, concorrência, auditoria backend e plano de rollback validados em ambiente real.

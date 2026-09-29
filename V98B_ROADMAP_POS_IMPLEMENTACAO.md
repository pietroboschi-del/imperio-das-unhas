# Pós-V98b

1. Publicar o repositório no GitHub e executar o workflow `V98 Backend CI` até ficar verde.
2. Corrigir qualquer falha real de Prisma/migration/build/runtime encontrada pelo CI.
3. Executar reconciliação dos três exports reais e produzir snapshot canônico.
4. Validar a importação do estado vigente da DEC-011 por unidade.
5. Somente então iniciar ownership por módulo: Identidade/Unidades/Catálogo → Profissionais → Clientes → Agenda.
6. Manter Agenda e Financeiro sem escrita remota até os respectivos módulos terem constraints e testes de concorrência.

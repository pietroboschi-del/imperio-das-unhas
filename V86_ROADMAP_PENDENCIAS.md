# Roadmap preservado após V86 — NÃO implementado nesta versão

1. **Tendência inteligente de preenchimento por lead time** — comparar ritmo atual versus histórico no mesmo D-x (ex.: sábado atual D-7 78% versus histórico D-7 55% = +23 p.p.).

2. **Recuperação da Fila de Encaixe** — origem da oportunidade; cancelamento recuperado; reagendamento recuperado; outras liberações; vagas recuperadas; valor comercial recuperado.

3. **Revisão visual** — logo interno; logo público; navegação; textos redundantes; hierarquia; responsividade; Configurações sem scroll horizontal.

4. **Campos e Opções restantes** — integrar formulários ainda fora da fonte central.

5. **Cadastro Dinâmico de Categorias de Serviço** — entidade própria; criar/editar/ativar/desativar/ordenar; histórico; `categoryId`; integração com `allowedCategoryIds`, estações, capacidade física, filtros, relatórios e rentabilidade; eliminar listas hardcoded; preferencialmente “Gerenciar categorias” dentro de Serviços.

6. **Comunicação / WhatsApp** — preparar arquitetura para múltiplos canais: Shopping Contagem; canal compartilhado Big Shopping + Centro de Contagem; canal de redes sociais/leads. Futuramente: roteamento por unidade/origem, confirmação, sinal, lembretes, cancelamento/reagendamento, templates, logs, status de envio e prevenção de duplicidade. **Não armazenar segredos de API de forma insegura no frontend/localStorage.**

7. **Prontuário Capilar Inteligente** — ambiente integrado ao mesmo ecossistema, compartilhando clientes, autenticação, profissionais, unidades, Agenda e Comanda, com entidades próprias para prontuário, avaliações, sessões, fotos, imagens de lente/microscópio, histórico químico, objetivo, biblioteca de produtos, recursos/equipamentos, protocolos sugeridos/realizados e evolução. Biblioteca de produtos é conhecimento, não necessariamente estoque. IA futura é apoio à decisão; profissional aprova/altera protocolo. Em possíveis sinais de patologia, não diagnosticar nem prescrever tratamento médico e orientar avaliação por profissional de saúde habilitado.

# V96 — Auditoria de implementação

A V95 foi usada como fonte de verdade. Antes das mudanças, a regressão V95 passou 40/40 suítes e 1.941 assertions.

## Arquitetura
A V96 adiciona leitura em sombra manual e comparativa. O backend só é candidato a leitura depois que o envelope exato (`instanceId + revision + dataHash`) estiver importado e todas as coleções do staging tiverem contagem e fingerprint equivalentes.

## Isolamento
O modelo anterior usava `registrationUnitId` como principal aproximação de escopo de clientes. A V96 cria `ClientUnitLink` e deriva presença de cliente por unidade tanto do cadastro quanto de bookings. Isso evita excluir uma cliente atendida em outra unidade e reduz risco de exposição por vínculo obsoleto.

Na reimportação completa, vínculos de cliente, profissional e acessos de usuário por unidade são recalculados em vez de apenas acumulados.

## Credenciais
Usuários legados continuam sendo criados sem senha importada e com redefinição obrigatória. Em importações posteriores, uma senha backend já redefinida não é apagada.

## Comparação
- Staging: fingerprint exato calculado no momento de importação.
- Manifesto por unidade: hash canônico recursivo, evitando falsos negativos pela ordem de chaves do JSONB.

## Limitação real da homologação
A instalação de dependências NPM não concluiu dentro do limite do ambiente de geração. Assim, não houve execução real de NestJS + Prisma contra PostgreSQL nesta sessão. O pacote contém migration SQL, código, contratos e testes, mas a execução DB real permanece requisito de homologação externa antes de qualquer cutover.

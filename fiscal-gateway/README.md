# Império das Unhas — Fiscal Gateway V69

Gateway Node.js para integração **direta** com a NFS-e Nacional (SEFIN). O navegador nunca recebe o certificado A1/PFX nem sua senha.

## Instalação

1. Instale Node.js 20+.
2. Entre nesta pasta e execute `npm install`.
3. Copie `.env.example` para `.env`.
4. Informe o caminho absoluto do certificado A1/PFX e a senha.
5. Mantenha `NFSE_ENV=restrita` e `ALLOW_PRODUCTION=false` durante a homologação.
6. Execute `npm start`.
7. No Império: **Configurações → Fiscal**, mantenha `http://127.0.0.1:8787` (ou o endereço HTTPS do servidor) e clique em **Testar Gateway**.

## Segurança

- Nunca coloque `.pfx`, senha ou `.env` dentro do ZIP publicado em servidor web.
- Produção é bloqueada pelo Gateway enquanto `ALLOW_PRODUCTION` não for `true`, independentemente do que o navegador pedir.
- Para servidor compartilhado, configure `FISCAL_GATEWAY_API_KEY`, CORS restritivo e HTTPS/reverse proxy.
- O protótipo ainda usa autenticação/localStorage no navegador; a proteção definitiva de autorização fiscal deve ser feita no backend futuro.

## Fluxo suportado na V69

- validar/montar DPS;
- emitir NFS-e na SEFIN Nacional;
- consultar NFS-e por chave;
- reconciliar uma DPS antes de qualquer reenvio incerto;
- armazenar XML autorizado no servidor.

O cancelamento automático permanece fora da V69: a fundação V68 continua permitindo registrar o cancelamento real, e o evento nacional será conectado numa etapa posterior após homologação do formato de evento.

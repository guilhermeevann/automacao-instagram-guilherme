# automacao-instagram-guilherme

Webhook receiver do comentario `AGENTE VERTICAL` -> private reply no Instagram, via
Meta Graph API (Instagram API com login do Instagram).

## O que faz

1. Recebe o evento `comments` no `POST /webhook` quando alguem comenta num post/reel.
2. Confere a assinatura `X-Hub-Signature-256` com o App Secret do Instagram.
3. Se o texto do comentario contiver a palavra-gatilho (`AGENTE VERTICAL`), envia uma
   private reply via `POST /{IG_USER_ID}/messages` com `recipient.comment_id`.
4. Guarda em memoria os `comment_id` ja respondidos (a Meta so aceita 1 private reply
   por comentario de qualquer forma; isso so evita uma chamada de API repetida).

## Variaveis de ambiente

Ver `.env.example`. Preencher no EasyPanel:

- `VERIFY_TOKEN` — string livre, usada so na verificacao do webhook (ja gerada, ver `.env` local).
- `IG_APP_SECRET` — chave secreta do **app do Instagram** (nao a do app principal da Meta).
- `IG_ACCESS_TOKEN` — token de acesso do Instagram. O que esta em uso agora e de teste
  (curta duracao, ~1h). Antes de ir pra producao precisa trocar por um de longa duracao
  (60 dias) e configurar refresh periodico — ainda nao implementado aqui.
- `IG_USER_ID` — IGSID da conta profissional (`17841400654167125`).

## Deploy no EasyPanel

1. Criar um app novo apontando pra este repo (`guilhermeevann/automacao-instagram-guilherme`).
2. Build via Dockerfile (ja incluido) ou Nixpacks (Node 18+, `npm start`).
3. Configurar as variaveis de ambiente acima na aba de Environment do app.
4. Expor a porta 3000 publicamente — o EasyPanel gera uma URL tipo
   `https://automacao-instagram-guilherme.xxxx.easypanel.host`.
5. Essa URL + `/webhook` e o **Callback URL** a cadastrar no painel da Meta
   (produto Instagram -> Configuracao da API -> passo 3, Configurar webhooks).
   O **Verify Token** la tem que ser identico ao `VERIFY_TOKEN` daqui.

## Limitacoes conhecidas (MVP)

- Dedupe de comentario e em memoria — reinicio do processo zera a lista (nao critico,
  a Meta bloqueia reenvio de qualquer forma).
- Token de acesso ainda e o de teste (tester), curta duracao. Trocar pelo fluxo de
  usuario real + long-lived token antes do App Review / producao.
- Sem retry/queue se a chamada de `/messages` falhar — so loga no console.

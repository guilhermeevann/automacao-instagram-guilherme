# automacao-instagram-guilherme

Webhook receiver de comentario -> private reply no Instagram, via Meta Graph API
(Instagram API com login do Instagram). Equivalente caseiro do Comments Growth Tool
do ManyChat: cada post pode ter sua propria palavra-chave e sua propria mensagem.

## O que faz

1. Recebe o evento `comments` no `POST /webhook` quando alguem comenta num post/reel.
2. Confere a assinatura `X-Hub-Signature-256` com o App Secret do Instagram.
3. Casa o comentario contra `rules.json` (post especifico primeiro, depois a regra
   `"all"` como fallback) e, se a palavra-chave bater, envia uma private reply via
   `POST /{IG_USER_ID}/messages` com `recipient.comment_id`.
4. Guarda em memoria os `comment_id` ja respondidos (a Meta so aceita 1 private reply
   por comentario de qualquer forma; isso so evita uma chamada de API repetida).

## Regras por post (`rules.json`)

```json
[
  {
    "media_id": "all",
    "keywords": ["AGENTE VERTICAL"],
    "reply_text": "Oi! Recebi seu comentario, ja te chamo aqui no direct."
  },
  {
    "media_id": "17912345678901234",
    "keywords": ["QUERO O PDF"],
    "reply_text": "Aqui esta o material que voce pediu: <link>"
  }
]
```

- `media_id: "all"` funciona como fallback — vale pra qualquer post que nao tenha
  uma regra propria (igual ao "todos os posts" do ManyChat).
- Uma regra com `media_id` especifico so vale pra comentarios naquele post/reel, e
  tem prioridade sobre a regra `"all"`.
- `keywords` aceita mais de uma palavra por regra; a comparacao ignora
  maiusculas/minusculas e acentos.
- **Como descobrir o `media_id` de um post novo:** comenta qualquer coisa nele com a
  automacao no ar e olha o log — toda vez que um comentario chega, o servidor imprime
  `Comentario recebido: media_id=... texto="..."`. Copia esse id, cria a regra, commita
  e redeploya.
- Depois de editar `rules.json`, precisa **commitar, dar push e redeployar no
  EasyPanel** — o arquivo e lido uma vez, na subida do processo.

## Variaveis de ambiente

Ver `.env.example`. Preencher no EasyPanel:

- `VERIFY_TOKEN` — string livre, usada so na verificacao do webhook (ja gerada, ver `.env` local).
- `IG_APP_SECRET` — chave secreta do **app do Instagram** (nao a do app principal da Meta).
- `IG_ACCESS_TOKEN` — token de acesso do Instagram gerado pelo botao "Gerar token" do
  painel (ja e de longa duracao, 60 dias). O servidor renova ele sozinho (ver abaixo)
  e persiste o token renovado em `data/token.json`.
- `IG_USER_ID` — IGSID da conta profissional (`17841400654167125`).

## Renovacao automatica do token

O token de 60 dias pode ser renovado por mais 60 dias assim que tiver pelo menos 24h
de vida. O servidor faz isso sozinho: ao subir, e depois a cada 24h, chama
`refresh_access_token` e salva o resultado em `data/token.json` (ignorado pelo git).

**Limite conhecido:** esse arquivo sobrevive a um *restart* do container, mas nao a um
*redeploy* (rebuild da imagem) — nesse caso o servidor volta a usar o valor da env var
`IG_ACCESS_TOKEN`, que pode estar desatualizado se fizer muito tempo desde a ultima vez
que foi editada manualmente. Pra evitar isso: sempre que for redeployar depois de uns
30-40 dias no ar, olha o log mais recente (`Token renovado, valido por mais ~N dias`)
e atualiza a env var no EasyPanel com esse valor antes de redeployar. Um jeito mais
robusto (persistir num volume ou banco) fica pra quando isso virar dor de verdade.

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
- Redeploy (rebuild) perde o token renovado em disco e volta pro valor da env var —
  ver secao "Renovacao automatica do token" acima.
- Sem retry/queue se a chamada de `/messages` falhar — so loga no console.

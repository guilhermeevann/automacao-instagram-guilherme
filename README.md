# automacao-instagram-guilherme

Webhook receiver de comentario -> private reply no Instagram, via Meta Graph API
(Instagram API com login do Instagram). Equivalente caseiro do Comments Growth Tool
do ManyChat: cada post pode ter sua propria palavra-chave e sua propria mensagem,
gerenciado por um painel web simples em vez de editar arquivo.

## O que faz

1. Recebe o evento `comments` no `POST /webhook` quando alguem comenta num post/reel.
2. Confere a assinatura `X-Hub-Signature-256` com o App Secret do Instagram.
3. Casa o comentario contra as regras salvas (post especifico primeiro, depois a
   regra `"all"` como fallback) e, se a palavra-chave bater, envia uma private reply
   via `POST /{IG_USER_ID}/messages` com `recipient.comment_id`.
4. Guarda em memoria os `comment_id` ja respondidos (a Meta so aceita 1 private reply
   por comentario de qualquer forma; isso so evita uma chamada de API repetida).
5. Registra cada tentativa (sucesso ou falha) no historico, visivel no painel.

## Painel de administracao (`/admin`)

Pagina unica (HTML+JS, sem build step) protegida por **HTTP Basic Auth**
(`ADMIN_USER`/`ADMIN_PASSWORD`). Da pra:

- **Regras:** criar/editar/apagar. Ao criar uma regra por post especifico, o painel
  busca os ultimos posts/reels via API do Instagram e mostra as miniaturas pra
  escolher — nao precisa mais descobrir `media_id` no log nem editar JSON na mao.
  A regra `"Todos os posts"` (fallback) e so mais uma regra, sem miniatura.
- **Historico:** ultimos comentarios respondidos, com status (enviado/falhou).
- **Status do token:** ha quanto tempo foi renovado e validade estimada, no topo da
  pagina.

Acesse em `https://<sua-url-do-easypanel>/admin`.

## Onde os dados moram

Tres arquivos dentro da pasta `data/` (fora do git, pensada pra ficar num **volume
persistente** montado no EasyPanel):

- `rules.json` — as regras. Na primeira subida, se nao existir ainda, e semeado a
  partir do `rules.json` da raiz do repo (que serve so de modelo inicial).
- `history.json` — ultimos 200 comentarios respondidos.
- `token.json` — token de acesso atual + quando foi renovado.

**Por isso o volume importa:** sem ele, tudo isso vive só no filesystem do
container, que sobrevive a um *restart* mas é apagado num *redeploy* (rebuild da
imagem) — voce perderia as regras criadas pelo painel e o token voltaria pro valor
antigo da env var a cada deploy.

### Configurar o volume no EasyPanel

No app, aba de armazenamento/volumes: monta um volume persistente no caminho
`/app/data` (mesmo caminho que o codigo usa por padrao). Uma vez montado, qualquer
redeploy futuro preserva regras, historico e token.

## Variaveis de ambiente

Ver `.env.example`. Preencher no EasyPanel:

- `VERIFY_TOKEN` — string livre, usada so na verificacao do webhook.
- `IG_APP_SECRET` — chave secreta do **app do Instagram** (nao a do app principal da Meta).
- `IG_ACCESS_TOKEN` — token de acesso do Instagram gerado pelo botao "Gerar token" do
  painel da Meta (ja e de longa duracao, 60 dias). So e usado se ainda nao existir
  `data/token.json` (primeira subida, ou volume novo).
- `IG_USER_ID` — IGSID da conta profissional (`17841400654167125`).
- `ADMIN_USER` / `ADMIN_PASSWORD` — login do painel `/admin`.

## Renovacao automatica do token

O token de 60 dias pode ser renovado por mais 60 dias assim que tiver pelo menos 24h
de vida. O servidor faz isso sozinho: ao subir, e depois a cada 24h, chama
`refresh_access_token` e salva o resultado em `data/token.json`. Com o volume
persistente configurado, esse ciclo roda indefinidamente sem precisar de intervencao
manual.

## Deploy no EasyPanel

1. Criar um app novo apontando pra este repo (`guilhermeevann/automacao-instagram-guilherme`).
2. Build via Dockerfile (ja incluido) ou Nixpacks (Node 18+, `npm start`).
3. Configurar as variaveis de ambiente acima na aba de Environment do app.
4. **Montar o volume persistente** em `/app/data` (ver secao acima).
5. Expor a porta 3000 publicamente — o EasyPanel gera uma URL tipo
   `https://automacao-instagram-guilherme.xxxx.easypanel.host`.
6. Essa URL + `/webhook` e o **Callback URL** a cadastrar no painel da Meta
   (produto Instagram -> Configuracao da API -> passo 3, Configurar webhooks).
   O **Verify Token** la tem que ser identico ao `VERIFY_TOKEN` daqui.
7. Acessa `<url>/admin` com o `ADMIN_USER`/`ADMIN_PASSWORD` configurados.

## Limitacoes conhecidas (MVP)

- Dedupe de comentario e em memoria — reinicio do processo zera a lista (nao critico,
  a Meta bloqueia reenvio de qualquer forma).
- Sem retry/queue se a chamada de `/messages` falhar — fica registrado no historico
  como "falhou", mas nao tenta de novo sozinho.
- `/api/media` busca so os ultimos 25 posts/reels — pra postar uma regra num post
  mais antigo, ainda precisa criar a regra manualmente com o `media_id` (visivel no
  log quando um comentario chega naquele post).

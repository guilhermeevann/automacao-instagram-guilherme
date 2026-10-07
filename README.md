# automacao-instagram-guilherme

Webhook receiver de comentario -> private reply no Instagram, via Meta Graph API
(Instagram API com login do Instagram). Equivalente caseiro do Comments Growth Tool
do ManyChat: cada post pode ter sua propria palavra-chave e sua propria mensagem,
gerenciado por um painel web simples em vez de editar arquivo.

**Quer rodar a sua?** Comece pelo [SETUP.md](SETUP.md) — passo a passo do zero, em 3 etapas.

## O que faz

1. Recebe o evento `comments` no `POST /webhook` quando alguem comenta num post/reel.
2. Confere a assinatura `X-Hub-Signature-256` com o App Secret do Instagram.
3. Casa o comentario contra as regras salvas (post especifico primeiro, depois a
   regra `"all"` como fallback) e, se a palavra-chave bater, envia uma private reply
   via `POST /{IG_USER_ID}/messages` com `recipient.comment_id`.
4. Se a regra tiver `comment_reply_text` preenchido, tambem comenta publicamente
   embaixo do comentario da pessoa via `POST /{comment-id}/replies` — independente
   do resultado da DM (um falhar nao trava o outro).
5. Se a regra tiver `require_follow` ligado, antes de mandar o conteudo confere se a
   pessoa segue a conta (`GET /<IGSID>?fields=is_user_follow_business`). Se nao
   seguir, manda um pedido pra seguir em vez do conteudo e guarda a pessoa como
   pendente. Quando ela manda qualquer mensagem de volta (webhook `messaging`),
   confere de novo e libera o conteudo se confirmado.
6. Guarda em memoria os `comment_id` ja respondidos (a Meta so aceita 1 private reply
   por comentario de qualquer forma; isso so evita uma chamada de API repetida).
7. Registra cada tentativa (DM e resposta publica, sucesso ou falha) no historico,
   visivel no painel.

## DM longa (mais de 1000 bytes)

A Meta aceita no máximo **1000 bytes por mensagem** (UTF-8), e a private reply (a DM que sai
do comentário) é **uma só**, só texto. Quando o `reply_text` da regra passa de 1000 bytes:

1. O comentário recebe uma **abertura curta** (campo `dm_abertura`; sem ele, um texto padrão
   com `{first_name}`) pedindo que a pessoa responda.
2. A pessoa responde qualquer coisa, o que abre a janela de 24 h.
3. O servidor manda o conteúdo em **partes de até 900 bytes**, em ordem, com a pausa humana de
   2 a 5 s entre elas. Se uma parte falhar, para ali e registra qual foi no histórico.

A divisão é feita em `src/dm-parts.js` e corta no limite mais natural: parágrafo, depois linha,
frase, palavra e, só em último caso, caractere (sem partir acento nem emoji). Título terminado
em dois pontos não fica sozinho no fim de uma parte. `npm test` roda os testes da divisão. No
painel, o campo da DM mostra os bytes e em quantas partes vai sair.

Duas respostas quase juntas da mesma pessoa não duplicam a entrega: o estado pendente é apagado
e devolvido numa operação só (`follow-gates-store.reivindicar`).

## Painel de administracao (`/admin`)

Pagina unica (HTML+JS, sem build step) protegida por **HTTP Basic Auth**
(`ADMIN_USER`/`ADMIN_PASSWORD`). Da pra:

- **Regras:** criar/editar/apagar. Ao criar uma regra por post especifico, o painel
  busca os ultimos posts/reels via API do Instagram e mostra as miniaturas pra
  escolher — nao precisa mais descobrir `media_id` no log nem editar JSON na mao.
  A regra `"Todos os posts"` (fallback) e so mais uma regra, sem miniatura.
  Palavras-chave sao um input de chips (nao mais texto separado por virgula),
  com validacao que ignora maiusculas/minusculas pra evitar duplicata
  ("AGENTE VERTICAL" e "agente vertical" contam como a mesma). Cada regra tambem
  aceita uma resposta publica opcional pro comentario, alem da DM, e um checkbox
  "Exigir que a pessoa siga antes de entregar" — liga o fluxo de gate descrito acima.
- **Historico:** ultimos comentarios respondidos, com status (enviado/falhou).
- **Status do token:** ha quanto tempo foi renovado e validade estimada, no topo da
  pagina.

Acesse em `https://<sua-url-do-easypanel>/admin`.

## Onde os dados moram

**Postgres (Supabase)**, via `DATABASE_URL`. Tres tabelas, todas com `account_id`
(pensado pra multiplas contas no futuro, mesmo que hoje so exista a do Guilherme):

- `ig_accounts` — token de acesso atual, quando foi renovado, IGSID.
- `rules` — as regras (`media_id`, `keywords[]`, `reply_text`, `comment_reply_text`
  opcional, `require_follow` opcional, miniatura do post). Na primeira subida, se a
  conta ainda nao tiver nenhuma regra, e semeada a partir do `rules.json` da raiz do
  repo (que serve so de modelo inicial).
- `comment_history` — cada comentario respondido, com status separado pra DM
  (`status`/`error`, incluindo o status `aguardando_seguir`) e pra resposta publica
  (`comment_reply_status`/`comment_reply_error`).
- `follow_gates` — quem esta esperando confirmar que segue antes de receber o
  conteudo de uma regra com `require_follow`. Uma linha por pessoa (por conta); um
  novo comentario da mesma pessoa substitui o gate pendente anterior.

O schema (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`
pras colunas novas) roda sozinho no boot (`src/db.js`) — nao precisa rodar
migration manual.

**Nota sobre TLS:** o Postgres do Supabase (pooler e conexao direta) apresenta um
certificado intermediario autoassinado na cadeia — comportamento conhecido e
documentado pelo proprio Supabase. Por isso `src/db.js` usa
`ssl: { rejectUnauthorized: false }`: a conexao continua criptografada, so a
validacao contra autoridades publicas fica desligada.

## Variaveis de ambiente

Ver `.env.example`. Preencher no EasyPanel:

- `VERIFY_TOKEN` — string livre, usada so na verificacao do webhook.
- `IG_APP_SECRET` — chave secreta do **app do Instagram** (nao a do app principal da Meta).
- `IG_ACCESS_TOKEN` — token de acesso do Instagram gerado pelo botao "Gerar token" do
  painel da Meta (ja e de longa duracao, 60 dias). So e usado se a conta ainda nao
  existir na tabela `ig_accounts` (primeira subida).
- `IG_USER_ID` — IGSID da conta profissional (aparece do lado do nome dela na lista
  de Testadores do Instagram, no painel da Meta).
- `ADMIN_USER` / `ADMIN_PASSWORD` — login do painel `/admin`.
- `DATABASE_URL` — connection string do Postgres (Supabase).

## Renovacao automatica do token

O token de 60 dias pode ser renovado por mais 60 dias assim que tiver pelo menos 24h
de vida. O servidor faz isso sozinho: ao subir, e depois a cada 24h, chama
`refresh_access_token` e atualiza a tabela `ig_accounts`. Como fica no Postgres,
sobrevive a qualquer redeploy sem precisar de volume nem intervencao manual.

## Deploy no EasyPanel

1. Criar um app novo apontando pra este repo (`guilhermeevann/automacao-instagram-guilherme`).
2. Build via Dockerfile (ja incluido) ou Nixpacks (Node 18+, `npm start`).
3. Configurar as variaveis de ambiente acima na aba de Environment do app
   (incluindo `DATABASE_URL`). Nao precisa de volume persistente — os dados ficam
   no Supabase.
4. Expor a porta 3000 publicamente — o EasyPanel gera uma URL tipo
   `https://automacao-instagram-guilherme.xxxx.easypanel.host`.
5. Essa URL + `/webhook` e o **Callback URL** a cadastrar no painel da Meta
   (produto Instagram -> Configuracao da API -> passo 3, Configurar webhooks).
   O **Verify Token** la tem que ser identico ao `VERIFY_TOKEN` daqui.
6. Acessa `<url>/admin` com o `ADMIN_USER`/`ADMIN_PASSWORD` configurados.

## Limitacoes conhecidas (MVP)

- Dedupe de comentario e em memoria — reinicio do processo zera a lista (nao critico,
  a Meta bloqueia reenvio de qualquer forma).
- Sem retry/queue se a chamada de `/messages` falhar — fica registrado no historico
  como "falhou", mas nao tenta de novo sozinho.
- `/api/media` busca so os ultimos 25 posts/reels — pra postar uma regra num post
  mais antigo, ainda precisa criar a regra manualmente com o `media_id` (visivel no
  log quando um comentario chega naquele post).

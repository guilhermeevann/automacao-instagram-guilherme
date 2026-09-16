# Setup do zero

Guia genérico pra quem clonou este repositório e quer rodar sua própria automação de
comentário → DM no Instagram. Três etapas — cada uma corresponde a um bloco do vídeo.

---

## Etapa 1 — Criar o app na Meta e gerar o token

1. Acesse [developers.facebook.com](https://developers.facebook.com/apps) e crie um
   app do tipo **Negócios** (não "Consumidor").
2. Em "Adicionar produto", marque só **"Gerenciar mensagens e conteúdo no Instagram"**.
   Não marque fundraising nem "Gerenciar tudo na sua Página" — são de outro fluxo
   (Facebook Login) e só aumentam o risco de rejeição depois.
3. No menu lateral, abra **Instagram → Configuração da API com login do Instagram**.
4. Passo "Adicionar permissões obrigatórias" → clique em **"Add all required
   permissions"**. Isso adiciona `instagram_business_basic`,
   `instagram_business_manage_comments` e `instagram_business_manage_messages`.
5. Vá em **Funções → Funções** e adicione a conta do Instagram que vai usar como
   **Testador do Instagram**. Depois disso, **abra o app do Instagram no celular** →
   Configurações → Apps e sites → aceite o convite de testador. Sem esse aceite, nada
   funciona.
6. Volte pra "Configuração da API", passo "Gerar tokens de acesso" → clique em
   **"Gerar token"** pra essa conta. O token que sai daqui **já é de 60 dias** — não
   tente trocá-lo por outro (a Meta rejeita, porque ele já é de longa duração).
7. Anote os quatro valores que você vai usar na Etapa 2:
   - **ID do app do Instagram** e **chave secreta do app do Instagram** — atenção,
     são diferentes do ID/chave do app principal que aparecem em Configurações →
     Básico.
   - **IGSID** da conta (aparece do lado do nome dela, na lista de testadores).
   - O **token** gerado no passo 6.

## Etapa 2 — Banco de dados e deploy

1. Crie um projeto gratuito em [supabase.com](https://supabase.com). Em
   **Configurações do projeto → Database**, copie a connection string do Postgres.
2. Clone este repositório e suba num host que rode containers Docker (EasyPanel,
   Render, Railway, Fly — qualquer um serve, o `Dockerfile` já está pronto).
3. Configure as variáveis de ambiente (veja `.env.example`):
   - `VERIFY_TOKEN` — qualquer string secreta que você inventar.
   - `IG_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID` — os valores da Etapa 1.
   - `ADMIN_USER` / `ADMIN_PASSWORD` — login que você vai usar no painel.
   - `DATABASE_URL` — a connection string do Supabase.
4. **Publique o app na Meta** (status "Ativo", não "Em desenvolvimento"). Sem isso a
   Meta nunca entrega webhook, nem pra contas testadoras.
5. De volta na Meta, em Instagram → Webhooks: **Callback URL** = `<sua-url>/webhook`,
   **Verify Token** = o mesmo valor que você colocou em `VERIFY_TOKEN`. Assine o
   campo `comments`.

## Etapa 3 — Criar sua primeira regra

1. Acesse `<sua-url>/admin` e faça login com o `ADMIN_USER`/`ADMIN_PASSWORD`.
2. Clique em **"+ Nova regra"**: escolha "Todos os posts" ou um post específico (o
   painel busca as miniaturas direto do Instagram).
3. Digite a palavra-chave (vira um chip) e a mensagem que vai por DM. Se quiser,
   preenche também a resposta pública que aparece embaixo do comentário.
4. Comente essa palavra-chave num post de teste e confira: a DM chega, e o
   comentário some no histórico do painel com o status do envio.

---

Detalhes técnicos, schema do banco e limitações conhecidas: ver [README.md](README.md).

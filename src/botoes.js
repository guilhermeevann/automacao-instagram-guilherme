// Botoes de resposta rapida (quick replies) do Instagram: ate 13 por mensagem,
// titulo de ate 20 caracteres. Ao tocar, o titulo chega como mensagem de texto
// comum, entao o tratamento de "a pessoa respondeu" ja serve.

const BOTAO_QUERO = { title: "Quero receber", payload: "QUERO_RECEBER" };
const BOTAO_SEGUI = { title: "Já segui", payload: "JA_SEGUI" };

// textos padrao quando a regra usa botoes (o texto de sempre manda digitar
// "quero" ou "segui", o que nao faz sentido com um botao na tela)
const TEXTO_ABERTURA_BOTAO =
  'Fala {first_name}! Separei o conteúdo pra você. Toca em "Quero receber" que eu te mando agora.';
const TEXTO_PEDIR_SEGUIR_BOTAO =
  'Fala {first_name}, vi que você comentou mas ainda não me segue. Aperta em me seguir e toca em "Já segui" que envio para você.';
const TEXTO_LEMBRETE_SEGUIR_BOTAO =
  '{first_name}, ainda não te vejo seguindo. Confere se salvou certinho e toca em "Já segui" de novo.';

const MAX_BOTOES = 13;
const MAX_TITULO = 20;

// corpo do campo "message" da API: so texto, ou texto com botoes
function montarMensagem(texto, botoes) {
  if (!botoes || botoes.length === 0) return { text: texto };
  return {
    text: texto,
    quick_replies: botoes.slice(0, MAX_BOTOES).map((b) => ({
      content_type: "text",
      title: Array.from(b.title).slice(0, MAX_TITULO).join(""),
      payload: b.payload,
    })),
  };
}

module.exports = {
  BOTAO_QUERO,
  BOTAO_SEGUI,
  TEXTO_ABERTURA_BOTAO,
  TEXTO_PEDIR_SEGUIR_BOTAO,
  TEXTO_LEMBRETE_SEGUIR_BOTAO,
  montarMensagem,
};

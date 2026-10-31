// Checagem em código do texto redigido para o cliente (docs/decisoes.md, seção 14).
// Se qualquer checagem falhar, o pipeline usa TEXTO_RESERVA e a autonomia vira "prepara e aguarda".

import { contemCompromisso } from "../faq";
import { MAX_RESPOSTA } from "./esquema";
import { normalizar } from "./sinais";

export const TEXTO_RESERVA =
  "Recebemos sua mensagem. Uma pessoa da nossa equipe vai analisar o seu caso e responder por aqui.";

export type FalhaChecagem =
  | "formato"
  | "numero_sem_fonte"
  | "numero_por_extenso"
  | "compromisso"
  | "dado_sensivel"
  | "link_sem_fonte"
  | "acao_feita"
  | "promessa_contato" // só no nível 0
  | "termo_de_solucao"; // níveis 0 e 1

export interface Permitido {
  textosFaq: readonly string[]; // textos das entradas de FAQ usadas na redação
  fatos: readonly string[]; // fatos do contexto do pedido, já formatados (ex.: "150,00")
  links: readonly string[]; // links das entradas de FAQ usadas
  nivel?: 0 | 1; // no nível 0 também se proíbe prometer contato ou narrar a atividade da equipe
}

export interface ResultadoChecagem {
  ok: boolean;
  falhas: FalhaChecagem[];
}

const RE_NUMERO = /\d+(?:[.,]\d+)*/g;
// "um" e "uma" ficam de fora por serem comuns demais.
const RE_NUMERO_EXTENSO =
  /\b(dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quinhentos|mil)\b/;
const RE_DADO_SENSIVEL = /\bcpf\b|\bcart(ao|oes)\b|\bsenhas?\b|\bcvv\b|codigo\s+de\s+seguranca/;
const RE_LINK = /\bhttps?:\/\/[^\s)<>"']+|\bwww\.[^\s)<>"']+/gi;

// Afirmações de ação já cumprida (formas ativas e passivas), sobre texto normalizado (sem acento, minúsculas).
// No nível 1 a ação aguarda aprovação; no nível 0 o agente só informa ou explica. Em nenhum dos dois o texto
// pode dizer que um chamado, reembolso, reenvio, troca etc. já foi feito.
const VERBOS_FEITOS =
  "acionamos|acionei|acionou|acionaram|abrimos|abri|abriu|abriram|solicitamos|solicitei|solicitou|solicitaram|" +
  "entramos\\s+em\\s+contato|entrei\\s+em\\s+contato|entrou\\s+em\\s+contato|reembolsamos|reembolsei|reembolsou|" +
  "estornamos|estornei|estornou|enviamos|enviei|reenviamos|reenviei|reenviou|cancelamos|cancelei|cancelou|" +
  "trocamos|troquei|trocou|providenciamos|providenciei|providenciou|registramos|registrei|registrou|" +
  "encaminhamos|encaminhei|encaminhou|resolvemos|resolvi|resolveu|corrigimos|corrigiu|alteramos|alterei|alterou|" +
  "processamos|processou|efetuamos|efetuou|realizamos|realizou|aprovamos|aprovou";
const PARTICIPIOS = "acionad|abert|solicitad|reembolsad|estornad|reenviad|cancelad|trocad|providenciad|registrad|encaminhad|processad|aprovad|efetuad|realizad|alterad|resolvid";
const OBJETOS = "chamado|solicitacao|protocolo|ocorrencia|reembolso|estorno|reenvio|cancelamento|troca|alteracao";

export const PADROES_ACAO_FEITA: readonly RegExp[] = [
  // "já acionamos", "já abriu chamado", "já entramos em contato"...
  new RegExp(`\\bja\\s+(${VERBOS_FEITOS})\\b`),
  // sem "já", verbos que só descrevem ação cumprida: "acionamos a transportadora", "abrimos um chamado"
  /\b(acionamos|acionou|acionaram|providenciamos|providenciou|estornamos|estornou|reembolsamos|reembolsou)\b/,
  /\b(abrimos|abriu|abriram|registramos|registrou)\s+(um\s+|uma\s+|o\s+|a\s+)?(chamado|solicitacao|protocolo|ocorrencia)\b/,
  // passivas: "foi aberto um chamado", "já foi reembolsado", "o reembolso foi feito"
  new RegExp(`\\bja\\s+(foi|foram|esta|estao)\\s+(${PARTICIPIOS})(o|a|os|as)\\b`),
  /\b(foi|foram)\s+(abert[oa]s?|registrad[oa]s?|solicitad[oa]s?)\s+(um\s+|uma\s+|o\s+|a\s+)?(chamado|solicitacao|protocolo|ocorrencia)\b/,
  new RegExp(`\\b(${OBJETOS})\\s+(ja\\s+)?(foi|foram)\\s+(feit|${PARTICIPIOS})(o|a|os|as)\\b`),
  new RegExp(`\\b(foi|foram)\\s+(feit|${PARTICIPIOS})(o|a|os|as)\\s+(o\\s+|a\\s+|um\\s+|uma\\s+)?(${OBJETOS})\\b`),
];

// Nível 0: a resposta só traz fatos do pedido e texto da FAQ; não promete contato, retorno ou prazo e não
// narra o que a equipe está fazendo. Projetado para que todas as entradas da FAQ passem (há teste).
// O texto de reserva ("uma pessoa da nossa equipe vai analisar") só é usado no nível 1, onde isso é permitido.
export const PADROES_PROMESSA_CONTATO: readonly RegExp[] = [
  /\bentrar(emos|a|ao)\s+em\s+contato\b/,
  /\b(vamos|vai|vao|iremos|ira|irao)\s+(entrar\s+em\s+contato|retornar|voltar\s+a\s+falar|avisar|informar|responder)\b/,
  /\bretornar(emos|a|ao)\b/,
  /\bdar(emos|a|ao)\s+(um\s+)?retorno\b/,
  /\bvoltar(emos|a|ao)\s+a\s+falar\b/,
  /\b(avisaremos|informaremos|notificaremos|manteremos|avisamos|retornamos)\b/,
  /\bem\s+breve\b/,
  /\b(estamos|esta|estao)\s+(acompanhando|verificando|analisando|investigando|monitorando|cuidando|avaliando)\b/,
  /\b(acompanharemos|verificaremos|analisaremos|investigaremos|avaliaremos|cuidaremos)\b/,
  /\bequipe\b[^.!?]{0,40}?\b(vai|vao|ira|irao|analisara|verificara|acompanhara|avaliara|investigara|cuidara|resolvera|entrara|retornara)\b/,
];

// Termos de solução, custo ou resultado (níveis 0 e 1). Cada termo só passa se o MESMO termo (a mesma família:
// "reposição" e "repor", "troca" e "trocar"...) aparecer nas entradas de FAQ usadas na redação. Assim o texto
// pode repetir o que a política diz ("o reenvio é sem custo"), mas não inventar "reposição sem custo" ou
// "troca gratuita". "Sem custo" e "sem nenhum custo" são termos diferentes de propósito: só a forma da FAQ passa.
// Sobre texto normalizado (sem acento, minúsculas), com fronteiras de palavra.
export const TERMOS_DE_SOLUCAO: Readonly<Record<string, RegExp>> = {
  reposicao: /\b(reposicao|reposicoes|repor|repomos|reporemos|reporao|repoe|repoem|reposto|repostos)\b/,
  // O particípio só conta depois de auxiliar ("será trocado"): "iniciais trocados" (na FAQ de personalização)
  // descreve o erro, não uma troca.
  troca:
    /\b(troca|trocas|trocar|trocamos|trocaremos|trocara|troque|troquem)\b|\b(ser|sera|serao|seja|sejam|for|forem|foi|foram)\s+trocad[oa]s?\b/,
  reembolso: /\b(reembolso|reembolsos|reembolsar|reembolsaremos|reembolsara|reembolsado|reembolsada|reembolse)\b/,
  estorno: /\b(estorno|estornos|estornar|estornaremos|estornara|estornado|estornada|estorne)\b/,
  devolucao: /\b(devolucao|devolucoes|devolver|devolvemos|devolveremos|devolvera|devolvido|devolvida|devolva|devolvam)\b/,
  desconto: /\b(desconto|descontos)\b/,
  cupom: /\b(cupom|cupons)\b/,
  sem_custo: /\bsem\s+custos?\b/,
  sem_nenhum_custo: /\bsem\s+nenhum\s+custo\b/,
  gratuito: /\b(gratuito|gratuita|gratuitos|gratuitas|gratuitamente|gratis)\b/,
  de_graca: /\bde\s+graca\b/,
  providenciar: /\b(providenciar|providenciaremos|providenciara|providenciarao|providenciando|providencie|providenciamos)\b/,
};

// Famílias de termos de solução presentes no texto (normalizado aqui).
export function termosDeSolucao(texto: string): string[] {
  const t = normalizar(texto);
  return Object.entries(TERMOS_DE_SOLUCAO)
    .filter(([, re]) => re.test(t))
    .map(([nome]) => nome);
}

// Termos do texto que não aparecem em nenhuma das entradas de FAQ usadas.
export function termosSemFonte(texto: string, textosFaq: readonly string[]): string[] {
  const naFaq = new Set(textosFaq.flatMap(termosDeSolucao));
  return termosDeSolucao(texto).filter((t) => !naFaq.has(t));
}

export function contemPromessaContato(texto: string): boolean {
  const t = normalizar(texto);
  return PADROES_PROMESSA_CONTATO.some((p) => p.test(t));
}

export function contemAcaoFeita(texto: string): boolean {
  const t = normalizar(texto);
  return PADROES_ACAO_FEITA.some((p) => p.test(t));
}

function numeros(texto: string): string[] {
  return texto.match(RE_NUMERO) ?? [];
}

function semPontuacaoFinal(link: string): string {
  return link.replace(/[.,;:!?]+$/, "");
}

export function verificarResposta(texto: string, permitido: Permitido): ResultadoChecagem {
  const falhas: FalhaChecagem[] = [];
  const t = normalizar(texto);

  if (texto.trim().length === 0 || texto.length > MAX_RESPOSTA) falhas.push("formato");

  // Links primeiro, para que os números de um link permitido não contem como números soltos.
  const links = (texto.match(RE_LINK) ?? []).map(semPontuacaoFinal);
  const linksPermitidos = permitido.links.map(semPontuacaoFinal);
  if (links.some((l) => !linksPermitidos.includes(l))) falhas.push("link_sem_fonte");
  const semLinks = texto.replace(RE_LINK, " ");

  const numerosPermitidos = new Set([
    ...permitido.textosFaq.flatMap(numeros),
    ...permitido.fatos.flatMap(numeros),
  ]);
  if (numeros(semLinks).some((n) => !numerosPermitidos.has(n))) falhas.push("numero_sem_fonte");
  if (RE_NUMERO_EXTENSO.test(t)) falhas.push("numero_por_extenso");

  if (contemCompromisso(texto) || contemCompromisso(t)) falhas.push("compromisso");
  if (RE_DADO_SENSIVEL.test(t)) falhas.push("dado_sensivel");
  if (contemAcaoFeita(texto)) falhas.push("acao_feita");
  if (permitido.nivel === 0 && contemPromessaContato(texto)) falhas.push("promessa_contato");
  if (termosSemFonte(texto, permitido.textosFaq).length > 0) falhas.push("termo_de_solucao");

  return { ok: falhas.length === 0, falhas };
}

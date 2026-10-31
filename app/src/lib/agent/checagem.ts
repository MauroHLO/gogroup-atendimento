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
  | "link_sem_fonte";

export interface Permitido {
  textosFaq: readonly string[]; // textos das entradas de FAQ usadas na redação
  fatos: readonly string[]; // fatos do contexto do pedido, já formatados (ex.: "150,00")
  links: readonly string[]; // links das entradas de FAQ usadas
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

  return { ok: falhas.length === 0, falhas };
}

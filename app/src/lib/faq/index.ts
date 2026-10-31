// FAQ em duas camadas (docs/decisoes.md, seção 7).
// Política: paráfrase própria da política de atendimento do desafio e da Central de Privacidade.
// Produto e promoções: estrutura pronta, conteúdo pendente (não se inventa regra da empresa).
// "validada: true" = conferida com o documento do desafio ou com a página pública citada.

import { NIVEL_BASE, type Motivo } from "../policy";

export type Camada = "politica" | "produto_promocoes";
export type Uso = "cliente" | "interno"; // "interno" só guia o resumo de nível 2, nunca vai ao cliente

export const TOPICOS_POLITICA = [
  "arrependimento",
  "avaria_item_faltante",
  "troca_fragrancia",
  "personalizacao",
  "endereco",
  "cobranca_duplicada",
  "reacao_adversa",
  "direitos_titular",
] as const;
export type TopicoPolitica = (typeof TOPICOS_POLITICA)[number];

export interface EntradaFaq {
  id: string;
  camada: Camada;
  motivos: readonly Motivo[];
  topico: string;
  texto: string;
  fonte: string | null;
  validada: boolean;
  uso: Uso;
}

// Verbos de compromisso que nenhum texto ao cliente pode conter (FAQ e, na parte 3, o texto redigido).
// Explicar a política é permitido; prometer reembolso, reenvio ou resultado não é.
export const PADROES_COMPROMISSO: readonly RegExp[] = [
  /\bgarantimos\b/i,
  /\bvamos\s+reembolsar\b/i,
  /\bj[aá]\s+reenviamos\b/i,
  /\bser[aá]\s+reembolsad[oa]s?\b/i,
  /\bser[aá]\s+reenviad[oa]s?\b/i,
];

export function contemCompromisso(texto: string): boolean {
  return PADROES_COMPROMISSO.some((p) => p.test(texto));
}

export const FONTE_POLITICA = "política de atendimento do desafio";
export const FONTE_PRIVACIDADE = "Central de Privacidade do GoGroup (https://privacidade.devgogroup.com)";

export const FAQ_POLITICA: readonly EntradaFaq[] = [
  {
    id: "int-cobranca-duplicada",
    camada: "politica",
    motivos: ["financeiro_cobranca"],
    topico: "cobranca_duplicada",
    texto:
      "Guia interno: encaminhar ao financeiro com o resumo do caso. Prazo de estorno na política: até 2 faturas no cartão ou até 5 dias úteis no Pix. Não confirmar estorno ao cliente antes da verificação.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "interno",
  },
  {
    id: "int-reacao-adversa",
    camada: "politica",
    motivos: ["reacao_adversa"],
    topico: "reacao_adversa",
    texto:
      "Guia interno: orientar a pessoa a parar de usar o produto. Em até 24 horas, abrir o registro de cosmetovigilância com o produto, o lote, a descrição do ocorrido e as fotos, e encaminhar o caso à responsável técnica. Trocar o produto não substitui esse registro, que deve ser feito mesmo quando houver troca.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "interno",
  },
  {
    id: "pol-arrependimento",
    camada: "politica",
    motivos: ["cancelamento", "duvida_politica"],
    topico: "arrependimento",
    texto:
      "Você pode desistir da compra em até 7 dias depois de receber o pedido, com devolução integral do valor pago, como prevê o Código de Defesa do Consumidor (art. 49). A solicitação é analisada pela nossa equipe antes de qualquer devolução.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "cliente",
  },
  {
    id: "pol-avaria-item-faltante",
    camada: "politica",
    motivos: ["avaria", "item_faltando", "duvida_politica"],
    topico: "avaria_item_faltante",
    texto:
      "Se o produto chegou danificado, vazando ou com algum item a menos, avise-nos em até 7 dias depois do recebimento. O reenvio é sem custo para você, mediante foto, sujeito à análise da equipe.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "cliente",
  },
  {
    id: "pol-endereco",
    camada: "politica",
    motivos: ["endereco", "duvida_politica"],
    topico: "endereco",
    texto:
      "O endereço de entrega só pode ser mudado enquanto o pedido ainda não entrou em separação. Depois dessa etapa, a alteração não é mais possível por aqui.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "cliente",
  },
  {
    id: "pol-personalizacao",
    camada: "politica",
    motivos: ["personalizacao_erro", "duvida_politica"],
    topico: "personalizacao",
    texto:
      "Se a personalização da sua Gocase veio diferente do que você pediu (nome, foto ou iniciais trocados, ou impressão borrada ou torta), avise-nos em até 7 dias depois do recebimento. A nova produção é sem custo para você, mediante foto, sujeita à análise da equipe.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "cliente",
  },
  {
    id: "pol-troca-fragrancia",
    camada: "politica",
    motivos: ["fragrancia", "duvida_politica"],
    topico: "troca_fragrancia",
    texto:
      "Se a fragrância não agradou, você pode solicitar uma única troca para cada pedido, dentro de 30 dias, desde que tenha usado até 20% do conteúdo. A solicitação passa pela análise da equipe.",
    fonte: FONTE_POLITICA,
    validada: true,
    uso: "cliente",
  },
  {
    id: "priv-direitos-titular",
    camada: "politica",
    motivos: ["direitos_titular"],
    topico: "direitos_titular",
    texto:
      "Para exercer seus direitos sobre seus dados pessoais, use a Central de Privacidade do GoGroup em https://privacidade.devgogroup.com. A Central informa que responde em até 15 dias a partir do recebimento da solicitação.",
    fonte: FONTE_PRIVACIDADE,
    validada: true,
    uso: "cliente",
  },
];

// Camada de produto e promoções: sem fonte validada até agora (cupom, frete, cashback, ficha de produto).
export const FAQ_PRODUTO: { readonly status: "pendente"; readonly entradas: readonly EntradaFaq[] } = {
  status: "pendente",
  entradas: [],
};

export const FAQ: readonly EntradaFaq[] = [...FAQ_POLITICA, ...FAQ_PRODUTO.entradas];

function porId(a: EntradaFaq, b: EntradaFaq): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function respondeCliente(e: EntradaFaq): boolean {
  return e.validada && e.uso === "cliente";
}

// Motivos com pelo menos uma entrada validada de uso "cliente" (visão geral, sem considerar a pergunta).
export function faqValidada(entradas: readonly EntradaFaq[] = FAQ): Set<Motivo> {
  const motivos = new Set<Motivo>();
  for (const e of entradas) {
    if (respondeCliente(e)) e.motivos.forEach((m) => motivos.add(m));
  }
  return motivos;
}

export interface ConsultaFaq {
  motivo: Motivo;
  topico?: string;
  saude: boolean;
}

// Busca determinística por motivo e tópico, só entradas validadas de uso "cliente", em ordem de id.
// Assunto de saúde nunca é respondido pela FAQ. Sem tópico, só responde quando o motivo
// tem um único tópico possível (ex.: duvida_politica sem tópico fica sem entrada).
export function buscarFaq(consulta: ConsultaFaq, entradas: readonly EntradaFaq[] = FAQ): EntradaFaq[] {
  if (consulta.saude) return [];
  const candidatas = entradas.filter((e) => respondeCliente(e) && e.motivos.includes(consulta.motivo));
  if (consulta.topico !== undefined) {
    return candidatas.filter((e) => e.topico === consulta.topico).sort(porId);
  }
  const topicos = new Set(candidatas.map((e) => e.topico));
  return topicos.size === 1 ? [...candidatas].sort(porId) : [];
}

// Conjunto de FAQ para uma conversa: motivos para os quais a busca acha entrada com o tópico dado.
// Calculado uma vez por conversa e passado igual para decidirNivel e acaoSugerida.
export function faqParaConsulta(
  consulta: { topico?: string; saude: boolean },
  entradas: readonly EntradaFaq[] = FAQ,
): Set<Motivo> {
  const motivos = new Set<Motivo>();
  for (const motivo of Object.keys(NIVEL_BASE) as Motivo[]) {
    if (buscarFaq({ motivo, ...consulta }, entradas).length > 0) motivos.add(motivo);
  }
  return motivos;
}

// Guia interno para o resumo de nível 2 (reação adversa, cobrança). Nunca gera resposta ao cliente.
export function guiaInterno(motivo: Motivo, entradas: readonly EntradaFaq[] = FAQ): EntradaFaq[] {
  return entradas.filter((e) => e.validada && e.uso === "interno" && e.motivos.includes(motivo)).sort(porId);
}

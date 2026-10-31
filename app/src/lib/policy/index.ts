// Regra de autonomia determinística (docs/decisoes.md, seções 5, 6 e 12).
// Função pura: sem chamadas externas. O LLM classifica; quem decide o nível é este código.

export type Motivo =
  | "rastreio"
  | "atraso"
  | "item_faltando"
  | "brinde"
  | "avaria"
  | "personalizacao_erro"
  | "cancelamento"
  | "endereco"
  | "financeiro_cobranca"
  | "pagamento_pendente"
  | "promo_cupom"
  | "troca_tamanho"
  | "fragrancia"
  | "duvida_produto"
  | "duvida_politica"
  | "direitos_titular"
  | "elogio"
  | "reacao_adversa"
  | "nao_classificado";

export type Canal = "whatsapp" | "email" | "reclame_aqui";

export type StatusEntrega =
  | "em_separacao"
  | "em_transito"
  | "entregue"
  | "atrasado"
  | "aguardando_pagamento";

export type Nivel = 0 | 1 | 2;

export interface EntradaPolitica {
  motivos: Motivo[]; // o primeiro é o principal
  statusEntrega: StatusEntrega;
  canal: Canal;
  seq: number; // nº da conversa no pedido (1 = primeira)
  valor: number; // R$
  saude: boolean;
  ameaca: boolean;
  confianca: number; // 0 a 1
  faqValidada: ReadonlySet<Motivo>;
}

export interface DecisaoNivel {
  nivel: Nivel;
  razoes: string[];
}

export const LIMIAR_CONFIANCA = 0.7;
export const LIMITE_VALOR = 200; // R$; cobre ~95% dos pedidos

export const NIVEL_BASE: Readonly<Record<Motivo, Nivel>> = {
  rastreio: 0,
  pagamento_pendente: 0,
  elogio: 0,
  duvida_politica: 0,
  direitos_titular: 0,
  duvida_produto: 1, // nível 0 só com FAQ validada
  promo_cupom: 1, // nível 0 só com FAQ validada
  atraso: 1,
  avaria: 1,
  item_faltando: 1,
  brinde: 1,
  personalizacao_erro: 1,
  cancelamento: 1,
  troca_tamanho: 1,
  fragrancia: 1,
  endereco: 1,
  nao_classificado: 1,
  reacao_adversa: 2,
  financeiro_cobranca: 2,
};

// Só estes motivos podem descer para o nível 0 com entrada validada na FAQ.
const MOTIVOS_FAQ: ReadonlySet<Motivo> = new Set<Motivo>(["duvida_produto", "promo_cupom"]);
const STATUS_RECUSA_ENDERECO: ReadonlySet<StatusEntrega> = new Set<StatusEntrega>([
  "em_transito",
  "entregue",
  "atrasado",
]);

function reais(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function nivelMotivo(
  motivo: Motivo,
  status: StatusEntrega,
  faq: ReadonlySet<Motivo>,
): { nivel: Nivel; razao: string } {
  if (motivo === "rastreio") {
    return status === "em_transito"
      ? { nivel: 0, razao: "rastreio com pedido em trânsito: nível 0" }
      : { nivel: 1, razao: `rastreio com status "${status}": verificar, nível 1` };
  }
  if (motivo === "endereco") {
    return STATUS_RECUSA_ENDERECO.has(status)
      ? { nivel: 0, razao: `endereço com status "${status}": recusa automática com explicação, nível 0` }
      : { nivel: 1, razao: `endereço com status "${status}": alteração assistida, nível 1` };
  }
  if (MOTIVOS_FAQ.has(motivo)) {
    return faq.has(motivo)
      ? { nivel: 0, razao: `${motivo} com entrada validada na FAQ: nível 0` }
      : { nivel: 1, razao: `${motivo} sem entrada validada na FAQ: nível 1` };
  }
  const nivel = NIVEL_BASE[motivo];
  if (nivel === undefined) {
    return { nivel: 1, razao: `motivo desconhecido "${motivo}": nível 1` };
  }
  return { nivel, razao: `${motivo}: nível-base ${nivel}` };
}

function validar(e: EntradaPolitica): void {
  if (!Number.isFinite(e.confianca) || e.confianca < 0 || e.confianca > 1) {
    throw new RangeError(`confianca fora de 0 a 1: ${e.confianca}`);
  }
  if (!Number.isInteger(e.seq) || e.seq < 1) {
    throw new RangeError(`seq deve ser inteiro >= 1: ${e.seq}`);
  }
  if (!Number.isFinite(e.valor) || e.valor < 0) {
    throw new RangeError(`valor inválido: ${e.valor}`);
  }
}

export function decidirNivel(entrada: EntradaPolitica): DecisaoNivel {
  validar(entrada);
  const razoes: string[] = [];
  let nivel: Nivel;

  // 1. Nível-base por motivo; com vários motivos vale o mais restritivo.
  if (entrada.motivos.length === 0) {
    nivel = 1;
    razoes.push("nenhum motivo classificado: nível 1");
  } else {
    const niveis = entrada.motivos.map((m, i) => {
      const r = nivelMotivo(m, entrada.statusEntrega, entrada.faqValidada);
      razoes.push(i === 0 ? `${r.razao} (motivo principal)` : r.razao);
      return r.nivel;
    });
    nivel = Math.max(...niveis) as Nivel;
    if (entrada.motivos.length > 1) {
      razoes.push(`vários motivos: vale o mais restritivo, nível ${nivel}`);
    }
  }

  // 2. Escalonadores: só sobem o nível.
  if (entrada.canal === "reclame_aqui") {
    nivel = 2;
    razoes.push("canal Reclame Aqui: nível 2");
  }
  if (entrada.seq >= 3) {
    nivel = 2;
    razoes.push(`${entrada.seq}º contato no pedido: nível 2`);
  } else if (entrada.seq === 2) {
    nivel = Math.max(nivel, 1) as Nivel;
    razoes.push("2º contato no pedido: pelo menos nível 1");
  }
  if (entrada.valor > LIMITE_VALOR) {
    nivel = Math.max(nivel, 1) as Nivel;
    razoes.push(`valor do pedido ${reais(entrada.valor)} acima de ${reais(LIMITE_VALOR)}: pelo menos nível 1`);
  }
  if (entrada.saude) {
    nivel = 2;
    razoes.push("assunto de saúde: nível 2");
  }
  if (entrada.ameaca) {
    nivel = 2;
    razoes.push("ameaça jurídica ou de reclamação pública: nível 2");
  }

  // 3. Confiança por último: +1 sobre o resultado, no máximo 2.
  if (entrada.confianca < LIMIAR_CONFIANCA) {
    nivel = Math.min(nivel + 1, 2) as Nivel;
    razoes.push(
      `confiança ${entrada.confianca.toFixed(2)} abaixo do limiar ${LIMIAR_CONFIANCA}: sobe um nível (resultado ${nivel})`,
    );
  }

  return { nivel, razoes };
}

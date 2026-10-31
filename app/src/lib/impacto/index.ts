// Painel de impacto: textos e números derivados dos agregados (dados.ts), puros e testáveis.
// Regras de redação: cada número diz se é da amostra, estimado para a população, hipótese ou associação;
// nada é apresentado como contato evitado medido (o agente não rodou em produção).

import { AGREGADOS, type ChaveAgregado } from "./dados";

export { AGREGADOS, type Agregado, type Arquivo, type ChaveAgregado } from "./dados";

const v = (k: ChaveAgregado): number => AGREGADOS[k].valor;

// ---------------------------------------------------------------- formatação pt-BR (sem depender de ICU)

export function arred1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function fmtInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Até 2 casas, sem zeros à direita: 14.5 → "14,5"; 72 → "72"; 3.08 → "3,08".
export function fmtDec(n: number): string {
  return Number(n.toFixed(2)).toString().replace(".", ",");
}

export function fmtPct(n: number): string {
  return `${fmtDec(n)}%`;
}

export function fmtRs(n: number): string {
  return `R$ ${fmtInt(n)}`;
}

// ---------------------------------------------------------------- derivados

export const DERIVADOS = {
  atrasoRastreioPctCusto: arred1(v("atrasoPctCusto") + v("rastreioPctCusto")),
  falhaProcessoPct: arred1((v("falhaProcesso") / v("conversasAmostra")) * 100),
  comunicacaoProativaPct: arred1((v("comunicacaoProativa") / v("conversasAmostra")) * 100),
  concordanciaPct: arred1(v("concordanciaGeral") * 100),
  divergenciaTetoPct: arred1(100 - v("concordanciaGeral") * 100),
  reacaoConcordanciaPct: arred1(v("reacaoConcordancia") * 100),
  rotaExpressLogisticaPct: arred1(v("rotaExpressLogistica")),
  rotaExpressReferenciaPct: arred1(v("rotaExpressReferencia")),
  proximaRaComAmeacaPct: arred1(v("proximaRaComAmeaca") * 100),
  proximaRaSemAmeacaPct: arred1(v("proximaRaSemAmeaca") * 100),
} as const;

const d = DERIVADOS;

// ---------------------------------------------------------------- estrutura do painel

export type Rotulo = "estimado" | "amostra" | "hipotese" | "associacao";

export const ROTULO: Readonly<Record<Rotulo, string>> = {
  estimado: "estimado para a população",
  amostra: "na amostra",
  hipotese: "hipótese",
  associacao: "associação, não causa",
};

export interface Destaque {
  valor: string;
  texto: string;
  rotulos: readonly Rotulo[];
  fontes: readonly ChaveAgregado[];
}

export interface Linha {
  texto: string;
  rotulos: readonly Rotulo[];
  fontes: readonly ChaveAgregado[];
}

export interface NivelSimulado {
  nivel: 0 | 1 | 2;
  titulo: string;
  conversas: number;
  pctConversas: number;
  pctCusto: number;
}

export interface BlocoImpacto {
  id: string;
  titulo: string;
  introducao?: string;
  aviso?: string;
  destaques: readonly Destaque[];
  linhas: readonly Linha[];
  niveis?: readonly NivelSimulado[];
  conclusao?: string;
  limites?: readonly string[];
}

export const INTRODUCAO_PAINEL = `Números da análise de ${fmtInt(v("conversasAmostra"))} conversas (amostra de 1 em cada 3 clientes), no período da amostra, gerados por analysis/analise_atendimento.py. Contagens e percentuais de conversas são da amostra; valores em R$ são estimativas para a população (amostra × 3).`;

const PROBLEMA: BlocoImpacto = {
  id: "problema",
  titulo: "O problema em números",
  destaques: [
    {
      valor: `≈ ${fmtInt(v("conversasEstimadas"))}`,
      texto: "conversas de atendimento no período da amostra.",
      rotulos: ["estimado"],
      fontes: ["conversasEstimadas"],
    },
    {
      valor: fmtRs(v("custoEstimado")),
      texto: "de custo de atendimento no período, pelo custo por conversa de cada canal.",
      rotulos: ["estimado"],
      fontes: ["custoEstimado"],
    },
    {
      valor: `${fmtPct(v("raPctCusto"))} do custo`,
      texto: `vem do Reclame Aqui, que tem só ${fmtPct(v("raPctConversas"))} das conversas.`,
      rotulos: ["estimado", "amostra"],
      fontes: ["raPctCusto", "raPctConversas"],
    },
    {
      valor: `${fmtPct(d.atrasoRastreioPctCusto)} do custo`,
      texto: `é atraso (${fmtPct(v("atrasoPctCusto"))}) e rastreio (${fmtPct(v("rastreioPctCusto"))}).`,
      rotulos: ["estimado"],
      fontes: ["atrasoPctCusto", "rastreioPctCusto"],
    },
    {
      valor: fmtPct(v("slaWhatsappEstouro")),
      texto: `das conversas de WhatsApp com resposta do atendente (${fmtInt(v("slaWhatsappConversas"))}) passam do SLA de 30 minutos, contado das 8h às 20h.`,
      rotulos: ["amostra"],
      fontes: ["slaWhatsappEstouro", "slaWhatsappConversas"],
    },
    {
      valor: fmtPct(v("foraDoHorario")),
      texto: "das conversas são abertas fora do horário dos atendentes (8h às 20h).",
      rotulos: ["amostra"],
      fontes: ["foraDoHorario"],
    },
    {
      valor: `${fmtDec(v("rotaExpressRazao"))}×`,
      texto: `Rota Express aparece em ${fmtPct(d.rotaExpressLogisticaPct)} dos contatos de rastreio e atraso, contra ${fmtPct(d.rotaExpressReferenciaPct)} dos pedidos dos demais contatos.`,
      rotulos: ["amostra", "associacao"],
      fontes: ["rotaExpressRazao", "rotaExpressLogistica", "rotaExpressReferencia"],
    },
  ],
  linhas: [
    {
      texto: `Recontato no Reclame Aqui: ${fmtPct(v("raRecontato"))} das conversas do canal são o 2º contato ou mais sobre o mesmo pedido, contra ${fmtPct(v("demaisRecontato"))} nos demais canais.`,
      rotulos: ["amostra"],
      fontes: ["raRecontato", "demaisRecontato"],
    },
  ],
};

const EVITAVEIS: BlocoImpacto = {
  id: "evitaveis",
  titulo: "Contatos potencialmente evitáveis (hipótese)",
  introducao:
    "O agente não rodou em produção: nada aqui é contato evitado medido. A hipótese agrupa cada conversa pelo seu motivo principal, inferido por regras.",
  destaques: [
    {
      valor: `${fmtInt(v("falhaProcesso"))} (${fmtPct(d.falhaProcessoPct)})`,
      texto: "conversas de falha de processo (atraso, avaria, item faltando, brinde, erro de personalização): evitáveis corrigindo a causa.",
      rotulos: ["amostra", "hipotese"],
      fontes: ["falhaProcesso", "conversasAmostra"],
    },
    {
      valor: `${fmtInt(v("comunicacaoProativa"))} (${fmtPct(d.comunicacaoProativaPct)})`,
      texto: "conversas que caberiam em comunicação proativa ou autoatendimento (rastreio, pagamento pendente, cancelamento, endereço, promoção, dúvida de produto).",
      rotulos: ["amostra", "hipotese"],
      fontes: ["comunicacaoProativa", "conversasAmostra"],
    },
    {
      valor: fmtPct(v("recontato")),
      texto: "das conversas são o 2º contato ou mais sobre o mesmo pedido.",
      rotulos: ["amostra"],
      fontes: ["recontato"],
    },
    {
      valor: fmtPct(v("atrasoEmTransito")),
      texto: "das reclamações de atraso chegam com o pedido ainda em trânsito: um aviso proativo poderia antecipar o contato.",
      rotulos: ["amostra"],
      fontes: ["atrasoEmTransito"],
    },
  ],
  linhas: [
    {
      texto: `Os recontatos somam ${fmtRs(v("custoRecontato"))} do custo estimado. É uma associação, não uma economia garantida.`,
      rotulos: ["estimado", "associacao"],
      fontes: ["custoRecontato"],
    },
  ],
};

const AUTONOMIA_SIMULADA: BlocoImpacto = {
  id: "autonomia",
  titulo: "Simulação de autonomia",
  introducao: `${fmtInt(v("conversasComMensagem"))} conversas com mensagem do cliente, na amostra; custo estimado. FAQ de produto e promoções pendente.`,
  aviso:
    "A simulação usa o classificador por regras do script Python (analysis/analise_atendimento.py), não o LLM do agente. O script ainda não tem os motivos dúvida de política e direitos do titular.",
  destaques: [],
  linhas: [],
  niveis: [
    {
      nivel: 0,
      titulo: "Nível 0: o agente executa",
      conversas: v("nivel0Conversas"),
      pctConversas: v("nivel0PctConversas"),
      pctCusto: v("nivel0PctCusto"),
    },
    {
      nivel: 1,
      titulo: "Nível 1: prepara e aguarda aprovação",
      conversas: v("nivel1Conversas"),
      pctConversas: v("nivel1PctConversas"),
      pctCusto: v("nivel1PctCusto"),
    },
    {
      nivel: 2,
      titulo: "Nível 2: humano obrigatório",
      conversas: v("nivel2Conversas"),
      pctConversas: v("nivel2PctConversas"),
      pctCusto: v("nivel2PctCusto"),
    },
  ],
  conclusao: `O nível 0 cobre ${fmtPct(v("nivel0PctConversas"))} das conversas, mas só ${fmtPct(v("nivel0PctCusto"))} do custo. O valor está em preparar o nível 1 (${fmtPct(v("nivel1PctCusto"))} do custo) e priorizar o nível 2 (${fmtPct(v("nivel2PctCusto"))} do custo, com humano).`,
};

const DEFESA: BlocoImpacto = {
  id: "defesa",
  titulo: "Como defendemos as conclusões",
  destaques: [],
  linhas: [
    {
      texto: `Base validada: ${fmtInt(v("conversasAmostra"))} conversas, ${fmtInt(v("mensagens"))} mensagens e ${fmtInt(v("pedidos"))} pedidos; ${fmtInt(v("conversasDuplicadas"))} conversas e ${fmtInt(v("mensagensDuplicadas"))} mensagens duplicadas.`,
      rotulos: ["amostra"],
      fontes: ["conversasAmostra", "mensagens", "pedidos", "conversasDuplicadas", "mensagensDuplicadas"],
    },
    {
      texto: `A tag manual do atendente bate com o motivo inferido em ${fmtPct(d.concordanciaPct)} das conversas: divergência de até ${fmtPct(d.divergenciaTetoPct)} (um teto; parte vem de conversas com dois assuntos e de limites do classificador).`,
      rotulos: ["amostra"],
      fontes: ["concordanciaGeral"],
    },
    {
      texto: `Reação adversa (${fmtInt(v("reacaoConversas"))} conversas): a tag concorda em ${fmtPct(d.reacaoConcordanciaPct)}, ${v("reacaoTagPropria") === 0 ? "nenhuma tem tag própria" : `${fmtInt(v("reacaoTagPropria"))} têm tag própria`}, o atendente oferece troca em ${fmtInt(v("reacaoOfereceTroca"))} de ${fmtInt(v("reacaoConversas"))} e ${v("reacaoCitaRegistro") === 0 ? "nenhuma cita registro ou lote" : `${fmtInt(v("reacaoCitaRegistro"))} citam registro ou lote`}. Por isso o agente sempre a leva ao nível 2.`,
      rotulos: ["amostra"],
      fontes: ["reacaoConversas", "reacaoConcordancia", "reacaoTagPropria", "reacaoOfereceTroca", "reacaoCitaRegistro"],
    },
    {
      texto: `Por que mascarar antes do modelo: das ${fmtInt(v("msgsCliente"))} mensagens de clientes, ${fmtInt(v("comCpf"))} têm CPF, ${fmtInt(v("comTelefone"))} telefone e ${fmtInt(v("comCartao"))} cartão.`,
      rotulos: ["amostra"],
      fontes: ["msgsCliente", "comCpf", "comTelefone", "comCartao"],
    },
  ],
};

const LIMITES: BlocoImpacto = {
  id: "limites",
  titulo: "Limites",
  destaques: [],
  linhas: [],
  limites: [
    "Os dados do desafio são sintéticos.",
    "A amostra é de 1 em cada 3 clientes; os valores em R$ são a amostra multiplicada por 3.",
    "O motivo vem de um classificador por regras sobre a mensagem de abertura, sem rótulo verdadeiro; a avaliação manual com conversas rotuladas está pendente.",
    "O custo por conversa é por canal: não distingue conversa resolvida pelo bot de conversa com atendente.",
    "A FAQ de produto e promoções está pendente; com ela validada, parte do nível 1 poderia ir ao nível 0.",
    `Ameaça seguida de Reclame Aqui é só indício: com ameaça, a próxima conversa do pedido é no Reclame Aqui em ${fmtPct(d.proximaRaComAmeacaPct)} dos casos, contra ${fmtPct(d.proximaRaSemAmeacaPct)} sem ameaça, em apenas ${fmtInt(v("casosComAmeaca"))} casos.`,
  ],
};

export const PAINEL: readonly BlocoImpacto[] = [PROBLEMA, EVITAVEIS, AUTONOMIA_SIMULADA, DEFESA, LIMITES];

export function descreverFonte(k: ChaveAgregado): string {
  const a = AGREGADOS[k];
  return `${a.arquivo} → ${a.chave}`;
}

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

// Sempre 1 casa (57 → "57,0%"), para a tabela da simulação ficar igual à do README.
export function fmtPct1(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

export function fmtRs(n: number): string {
  return `R$ ${fmtInt(n)}`;
}

// Para os cartões do topo: 108299 → "R$ 108 mil". O valor exato fica no title do cartão.
export function fmtRsMil(n: number): string {
  return `R$ ${fmtInt(n / 1000)} mil`;
}

// ---------------------------------------------------------------- derivados

export const DERIVADOS = {
  atrasoRastreioPctCusto: arred1(v("atrasoPctCusto") + v("rastreioPctCusto")),
  falhaProcessoPct: arred1((v("falhaProcesso") / v("conversasAmostra")) * 100),
  comunicacaoProativaPct: arred1((v("comunicacaoProativa") / v("conversasAmostra")) * 100),
  concordanciaPct: arred1(v("concordanciaGeral") * 100),
  divergenciaPct: arred1(100 - v("concordanciaGeral") * 100),
  tagIncoerentesPct: Math.round((v("tagIncoerentes") / v("tagAvaliadas")) * 100),
  rotulosRevisadosPct: Math.round((v("rotulosRevisados") / v("rotulosAmostra")) * 1000) / 10,
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
  // Rótulo de poucas palavras do cartão visível; sem ele, o destaque só aparece nos detalhes.
  curto?: string;
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
  // Legenda de uma linha, visível; o texto completo (introducao, aviso) fica nos detalhes.
  legenda?: string;
  // Resumo de uma linha dos blocos recolhidos.
  resumo?: string;
  introducao?: string;
  aviso?: string;
  destaques: readonly Destaque[];
  linhas: readonly Linha[];
  niveis?: readonly NivelSimulado[];
  conclusao?: string;
  limites?: readonly string[];
}

export const INTRODUCAO_PAINEL = `${fmtInt(v("conversasAmostra"))} conversas, de 1 em cada 3 clientes. Percentuais de conversas são da amostra; valores em R$ são estimados (amostra × 3).`;

export const ORIGEM_NUMEROS = "Gerados por analysis/analise_atendimento.py e conferidos por teste contra data/processed/.";

export const PRINCIPIO = "O modelo entende e redige; o código decide.";

export const LEGENDA_SOLIDEZ = "sólido = estimado; hachurado = hipótese";
export const NOTA_SOLIDEZ = "Nestes gráficos nenhuma barra é hipótese; % das conversas é medido na amostra.";

const PROBLEMA: BlocoImpacto = {
  id: "problema",
  titulo: "O problema em números",
  legenda: "Fila, horário e transportadora, além do custo acima.",
  destaques: [
    {
      valor: `≈ ${fmtInt(v("conversasEstimadas"))}`,
      texto: "conversas de atendimento no período da amostra.",
      curto: "conversas no período",
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
      curto: "do WhatsApp passa do SLA",
      texto: `das conversas de WhatsApp com resposta do atendente (${fmtInt(v("slaWhatsappConversas"))}) passam do SLA de 30 minutos, contado das 8h às 20h.`,
      rotulos: ["amostra"],
      fontes: ["slaWhatsappEstouro", "slaWhatsappConversas"],
    },
    {
      valor: fmtPct(v("foraDoHorario")),
      texto: "das conversas são abertas fora do horário dos atendentes (8h às 20h).",
      curto: "abertas fora do horário",
      rotulos: ["amostra"],
      fontes: ["foraDoHorario"],
    },
    {
      valor: `${fmtDec(v("rotaExpressRazao"))}×`,
      curto: "Rota Express em rastreio e atraso",
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
  legenda: "O agente não rodou em produção: nada aqui é medido.",
  introducao:
    "O agente não rodou em produção: nada aqui é contato evitado medido. A hipótese agrupa cada conversa pelo seu motivo principal, inferido por regras.",
  destaques: [
    {
      valor: `${fmtInt(v("falhaProcesso"))} (${fmtPct(d.falhaProcessoPct)})`,
      curto: "falha de processo",
      texto: "conversas de falha de processo (atraso, avaria, item faltando, brinde, erro de personalização): evitáveis corrigindo a causa.",
      rotulos: ["amostra", "hipotese"],
      fontes: ["falhaProcesso", "conversasAmostra"],
    },
    {
      valor: `${fmtInt(v("comunicacaoProativa"))} (${fmtPct(d.comunicacaoProativaPct)})`,
      curto: "proativa ou autoatendimento",
      texto: "conversas que caberiam em comunicação proativa ou autoatendimento (rastreio, pagamento pendente, cancelamento, endereço, promoção, dúvida de produto).",
      rotulos: ["amostra", "hipotese"],
      fontes: ["comunicacaoProativa", "conversasAmostra"],
    },
    {
      valor: fmtPct(v("recontato")),
      texto: "das conversas são o 2º contato ou mais sobre o mesmo pedido.",
      curto: "são recontato",
      rotulos: ["amostra"],
      fontes: ["recontato"],
    },
    {
      valor: fmtPct(v("atrasoEmTransito")),
      curto: "dos atrasos ainda em trânsito",
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
  legenda: "Simulação com o classificador por regras, não com o LLM do agente.",
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
  // fmtPct1: mesma casa decimal da tabela (60.0 → "60,0%").
  conclusao: `O nível 0 cobre ${fmtPct1(v("nivel0PctConversas"))} das conversas, mas só ${fmtPct1(v("nivel0PctCusto"))} do custo. O valor está em preparar o nível 1 (${fmtPct1(v("nivel1PctCusto"))} do custo) e priorizar o nível 2 (${fmtPct1(v("nivel2PctCusto"))} do custo, com humano).`,
};

const DEFESA: BlocoImpacto = {
  id: "defesa",
  titulo: "Como defendemos as conclusões",
  resumo: "Base validada, divergências de rótulo declaradas e o porquê do mascaramento.",
  destaques: [],
  linhas: [
    {
      texto: `Base validada: ${fmtInt(v("conversasAmostra"))} conversas, ${fmtInt(v("mensagens"))} mensagens e ${fmtInt(v("pedidos"))} pedidos; ${fmtInt(v("conversasDuplicadas"))} conversas e ${fmtInt(v("mensagensDuplicadas"))} mensagens duplicadas.`,
      rotulos: ["amostra"],
      fontes: ["conversasAmostra", "mensagens", "pedidos", "conversasDuplicadas", "mensagensDuplicadas"],
    },
    {
      texto: `A tag manual e o classificador por regras divergem em ${fmtPct(d.divergenciaPct)} das conversas; parte é erro da tag e parte das regras (numa amostra estratificada por tag, ${fmtPct(d.tagIncoerentesPct)} das tags não batem com nenhum motivo lido no texto).`,
      rotulos: ["amostra"],
      fontes: ["concordanciaGeral", "tagIncoerentes", "tagAvaliadas"],
    },
    {
      texto: `Reação adversa (${fmtInt(v("reacaoConversas"))} conversas): a tag manual e o classificador por regras concordam em só ${fmtPct(d.reacaoConcordanciaPct)}; parte é erro da tag e parte das regras. ${v("reacaoTagPropria") === 0 ? "Nenhuma tem tag própria" : `${fmtInt(v("reacaoTagPropria"))} têm tag própria`}, o atendente oferece troca em ${fmtInt(v("reacaoOfereceTroca"))} de ${fmtInt(v("reacaoConversas"))} e ${v("reacaoCitaRegistro") === 0 ? "nenhuma cita registro ou lote" : `${fmtInt(v("reacaoCitaRegistro"))} citam registro ou lote`}. Por isso o agente sempre a leva ao nível 2.`,
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
  resumo: "Dados sintéticos, nada medido em produção, avaliação com revisão humana parcial.",
  destaques: [],
  linhas: [],
  limites: [
    "Os dados do desafio são sintéticos.",
    "A amostra é de 1 em cada 3 clientes; os valores em R$ são a amostra multiplicada por 3.",
    "O motivo da análise vem de um classificador por regras sobre a mensagem de abertura, sem rótulo verdadeiro.",
    `O classificador do agente foi avaliado em ${fmtInt(v("rotulosAmostra"))} conversas rotuladas por leitura de uma IA, com revisão humana parcial (${fmtInt(v("rotulosRevisados"))} dos ${fmtInt(v("rotulosAmostra"))} rótulos, ${fmtPct1(d.rotulosRevisadosPct)}) e sem independência total; detalhes em docs/decisoes.md, seção 16.`,
    "O custo por conversa é por canal: não distingue conversa resolvida pelo bot de conversa com atendente.",
    "A FAQ de produto e promoções está pendente; com ela validada, parte do nível 1 poderia ir ao nível 0.",
    `Ameaça seguida de Reclame Aqui é só indício: com ameaça, a próxima conversa do pedido é no Reclame Aqui em ${fmtPct(d.proximaRaComAmeacaPct)} dos casos, contra ${fmtPct(d.proximaRaSemAmeacaPct)} sem ameaça, em apenas ${fmtInt(v("casosComAmeaca"))} casos.`,
  ],
};

export const PAINEL: readonly BlocoImpacto[] = [PROBLEMA, EVITAVEIS, AUTONOMIA_SIMULADA, DEFESA, LIMITES];

// ---------------------------------------------------------------- cartões do topo e gráficos

export interface Cartao {
  id: string;
  valor: string;
  texto: string;
  detalhe: string; // title do cartão: o valor exato
  rotulos: readonly Rotulo[];
  fontes: readonly ChaveAgregado[];
}

export const CARTOES: readonly Cartao[] = [
  {
    id: "custo",
    valor: fmtRsMil(v("custoEstimado")),
    texto: "de custo de atendimento no período",
    detalhe: `${fmtRs(v("custoEstimado"))} de custo estimado`,
    rotulos: ["estimado"],
    fontes: ["custoEstimado"],
  },
  {
    id: "reclame-aqui",
    valor: fmtPct1(v("raPctCusto")),
    texto: `do custo no Reclame Aqui, com ${fmtPct1(v("raPctConversas"))} das conversas`,
    detalhe: `Reclame Aqui: ${fmtPct1(v("raPctCusto"))} do custo e ${fmtPct1(v("raPctConversas"))} das conversas`,
    rotulos: ["estimado", "amostra"],
    fontes: ["raPctCusto", "raPctConversas"],
  },
  {
    id: "niveis",
    valor: `${fmtPct1(v("nivel2PctConversas"))} → ${fmtPct1(v("nivel2PctCusto"))}`,
    texto: `das conversas (nível 2) concentram ${fmtPct1(v("nivel2PctCusto"))} do custo`,
    detalhe: `Nível 2: ${fmtPct1(v("nivel2PctConversas"))} das conversas e ${fmtPct1(v("nivel2PctCusto"))} do custo`,
    rotulos: ["amostra", "estimado"],
    fontes: ["nivel2PctConversas", "nivel2PctCusto"],
  },
];

export interface SerieNiveis {
  id: "conversas" | "custo";
  rotulo: string;
  tipo: Rotulo;
  segmentos: readonly { nivel: 0 | 1 | 2; pct: number }[];
}

export const SERIES_NIVEIS: readonly SerieNiveis[] = [
  {
    id: "conversas",
    rotulo: "% das conversas",
    tipo: "amostra",
    segmentos: [
      { nivel: 0, pct: v("nivel0PctConversas") },
      { nivel: 1, pct: v("nivel1PctConversas") },
      { nivel: 2, pct: v("nivel2PctConversas") },
    ],
  },
  {
    id: "custo",
    rotulo: "% do custo",
    tipo: "estimado",
    segmentos: [
      { nivel: 0, pct: v("nivel0PctCusto") },
      { nivel: 1, pct: v("nivel1PctCusto") },
      { nivel: 2, pct: v("nivel2PctCusto") },
    ],
  },
];

export interface BarraCanal {
  id: "reclame_aqui" | "whatsapp" | "email";
  rotulo: string;
  pctConversas: number;
  pctCusto: number;
  destaque: boolean;
}

// Ordenado por % do custo; o Reclame Aqui é o destaque.
export const CANAIS: readonly BarraCanal[] = (
  [
    { id: "reclame_aqui", rotulo: "Reclame Aqui", pctConversas: v("raPctConversas"), pctCusto: v("raPctCusto"), destaque: true },
    { id: "whatsapp", rotulo: "WhatsApp", pctConversas: v("whatsappPctConversas"), pctCusto: v("whatsappPctCusto"), destaque: false },
    { id: "email", rotulo: "E-mail", pctConversas: v("emailPctConversas"), pctCusto: v("emailPctCusto"), destaque: false },
  ] satisfies BarraCanal[]
).sort((a, b) => b.pctCusto - a.pctCusto);

export interface BarraMotivo {
  id: string; // valor da 1ª coluna de motivos_custos.csv
  rotulo: string;
  fonte: ChaveAgregado;
  pctCusto: number;
  destaque: boolean;
}

const MOTIVOS_CUSTO: readonly (readonly [string, string, ChaveAgregado])[] = [
  ["atraso", "Atraso", "atrasoPctCusto"],
  ["rastreio", "Rastreio", "rastreioPctCusto"],
  ["financeiro_cobranca", "Cobrança", "cobrancaPctCusto"],
  ["avaria", "Avaria", "avariaPctCusto"],
  ["sem_mensagem_cliente", "Sem mensagem do cliente", "semMensagemPctCusto"],
  ["item_faltando", "Item faltando", "itemFaltandoPctCusto"],
  ["cancelamento", "Cancelamento", "cancelamentoPctCusto"],
  ["duvida_produto", "Dúvida de produto", "duvidaProdutoPctCusto"],
  ["brinde", "Brinde", "brindePctCusto"],
  ["troca_tamanho", "Troca de tamanho", "trocaTamanhoPctCusto"],
  ["personalizacao_erro", "Erro de personalização", "personalizacaoPctCusto"],
  ["promo_cupom", "Promoção e cupom", "promoCupomPctCusto"],
  ["fragrancia", "Fragrância", "fragranciaPctCusto"],
  ["endereco", "Endereço", "enderecoPctCusto"],
  ["pagamento_pendente", "Pagamento pendente", "pagamentoPendentePctCusto"],
  ["elogio", "Elogio", "elogioPctCusto"],
  ["reacao_adversa", "Reação adversa", "reacaoAdversaPctCusto"],
  ["nao_classificado", "Não classificado", "naoClassificadoPctCusto"],
];

export const MOTIVOS: readonly BarraMotivo[] = MOTIVOS_CUSTO.map(([id, rotulo, fonte]) => ({
  id,
  rotulo,
  fonte,
  pctCusto: v(fonte),
  destaque: id === "atraso" || id === "rastreio",
})).sort((a, b) => b.pctCusto - a.pctCusto);

export const LEGENDA_MOTIVOS = `Atraso e rastreio somam ${fmtPct1(d.atrasoRastreioPctCusto)} do custo.`;
export const LEGENDA_CANAIS = `O Reclame Aqui tem ${fmtPct1(v("raPctConversas"))} das conversas e ${fmtPct1(v("raPctCusto"))} do custo.`;

export function descreverFonte(k: ChaveAgregado): string {
  const a = AGREGADOS[k];
  return `${a.arquivo} → ${a.chave}`;
}

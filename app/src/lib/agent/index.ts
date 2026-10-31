// Pipeline do agente (docs/decisoes.md, seções 4 e 14).
// mascarar -> classificar (modelo) -> sinais -> FAQ da conversa (uma vez) -> nível (código)
// -> ação (código, mesmo conjunto de FAQ) -> redigir (modelo, só níveis 0 e 1) -> checar (código).
// O modelo classifica e redige; quem decide nível e ação é o código. Nada aqui loga ou guarda a mensagem.

import { acaoSugerida as acaoSugeridaPadrao, type AcaoSugerida } from "../acoes";
import { buscarFaq, faqParaConsulta, guiaInterno, type EntradaFaq } from "../faq";
import { mascararPii } from "../pii";
import {
  decidirNivel as decidirNivelPadrao,
  nivelMotivo,
  type Motivo,
  type Nivel,
} from "../policy";
import { TEXTO_RESERVA, verificarResposta, type ResultadoChecagem } from "./checagem";
import {
  FalhaAgente,
  MAX_TOKENS_CLASSIFICACAO,
  MAX_TOKENS_REDACAO,
  TIMEOUT_CHAMADA_MS,
  type ClienteLLM,
  type PedidoJson,
  type RespostaJson,
  type TipoFalha,
  type Uso,
} from "./cliente";
import {
  Classificacao,
  CLASSIFICACAO_INVALIDA,
  ESQUEMA_CLASSIFICACAO,
  ESQUEMA_REDACAO,
  MOTIVOS,
  Redacao,
} from "./esquema";
import { fatosDoPedido, promptClassificacao, promptRedacao, type ContextoPedido } from "./prompts";
import { detectarSinais } from "./sinais";

export { FalhaAgente, criarClienteGroq, type ClienteLLM } from "./cliente";
export type { ContextoPedido } from "./prompts";

export const ORCAMENTO_MS = 12_000; // orçamento total do pipeline
export const MIN_CHAMADA_MS = 1_500; // abaixo disso não vale começar uma chamada
export const RAZAO_FALHA = "falha interna: revisão humana";

// "interno" = exceção fora do cliente do modelo (ex.: RangeError da policy, erro de programação).
export type TipoFalhaPipeline = TipoFalha | "interno";

export interface EntradaAgente {
  mensagem: string;
  contexto: ContextoPedido;
}

export interface Dependencias {
  // Função para que a falta de chave (FalhaAgente "config") caia no tratamento de falhas.
  cliente: ClienteLLM | (() => ClienteLLM);
  decidirNivel?: typeof decidirNivelPadrao;
  acaoSugerida?: typeof acaoSugeridaPadrao;
  agora?: () => number;
  orcamentoMs?: number;
}

export interface Chamada {
  nome: PedidoJson["nome"];
  uso: Uso | null;
  finishReason: string | null;
  ms: number;
  zodOk: boolean;
}

export interface ResultadoAgente {
  nivel: Nivel;
  razoes: string[];
  motivos: Motivo[]; // ordem canônica: o primeiro é o principal
  motivoPrincipal: Motivo | null;
  topico: string | null;
  confianca: number | null;
  classificacaoValida: boolean;
  sinais: { saude: boolean; ameaca: boolean };
  acao: AcaoSugerida;
  resposta: string | null; // nunca no nível 2
  resumoInterno: string | null; // só no nível 2
  faqUsada: string[];
  checagem: ResultadoChecagem | null;
  fallback: boolean; // texto de reserva usado porque a checagem reprovou
  falha: { tipo: TipoFalhaPipeline } | null;
  chamadas: Chamada[]; // telemetria sem texto
}

const ACAO_FALHA: AcaoSugerida = {
  acao: "escalar_atendimento_humano",
  descricao: "Falha interna: encaminhar à fila humana para revisão.",
  autonomia: "escala_para_humano",
};

const ORDEM_MOTIVO = new Map<Motivo, number>(MOTIVOS.map((m, i) => [m, i]));

// Ordem canônica: maior nível mínimo primeiro; empate pela ordem fixa de MOTIVOS.
// Assim a ordem devolvida pelo modelo não muda o resultado.
export function ordenarMotivos(
  motivos: readonly Motivo[],
  statusEntrega: ContextoPedido["statusEntrega"],
  faq: ReadonlySet<Motivo>,
): Motivo[] {
  const unicos = [...new Set(motivos)];
  return unicos.sort((a, b) => {
    const dn = nivelMotivo(b, statusEntrega, faq).nivel - nivelMotivo(a, statusEntrega, faq).nivel;
    return dn !== 0 ? dn : (ORDEM_MOTIVO.get(a) ?? 99) - (ORDEM_MOTIVO.get(b) ?? 99);
  });
}

function unicasPorId(entradas: EntradaFaq[]): EntradaFaq[] {
  const vistos = new Set<string>();
  return entradas.filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)));
}

function linksDe(entradas: readonly EntradaFaq[]): string[] {
  return entradas.flatMap((e) => e.texto.match(/https?:\/\/[^\s)]+/g) ?? []).map((l) => l.replace(/[.,;:!?]+$/, ""));
}

export function montarResumo(r: {
  motivos: readonly Motivo[];
  sinais: { saude: boolean; ameaca: boolean };
  confianca: number | null;
  razoes: readonly string[];
  acao: AcaoSugerida;
  guias: readonly EntradaFaq[];
}): string {
  const sinais = [r.sinais.saude && "saúde", r.sinais.ameaca && "ameaça"].filter(Boolean).join(", ") || "nenhum";
  const linhas = [
    `Motivos: ${r.motivos.join(", ") || "nenhum"}.`,
    `Sinais: ${sinais}.`,
    `Confiança da classificação: ${r.confianca === null ? "n/d" : r.confianca.toFixed(2)}.`,
    `Ação: ${r.acao.descricao}`,
    `Razões do nível: ${r.razoes.join("; ")}.`,
    ...r.guias.map((g) => `Guia (${g.id}): ${g.texto}`),
  ];
  return linhas.join("\n");
}

export async function processarConversa(entrada: EntradaAgente, deps: Dependencias): Promise<ResultadoAgente> {
  const decidirNivel = deps.decidirNivel ?? decidirNivelPadrao;
  const acaoSugerida = deps.acaoSugerida ?? acaoSugeridaPadrao;
  const agora = deps.agora ?? Date.now;
  const prazo = agora() + (deps.orcamentoMs ?? ORCAMENTO_MS);
  const chamadas: Chamada[] = [];
  const contexto = entrada.contexto;

  // Estado parcial, para o resultado de falha aproveitar o que já se sabe.
  let motivos: Motivo[] = [];
  let sinais = { saude: false, ameaca: false };
  let confianca: number | null = null;

  const restante = () => prazo - agora();

  async function chamar<T>(
    cliente: ClienteLLM,
    pedido: Omit<PedidoJson, "timeoutMs">,
    validar: (dados: unknown) => { success: true; data: T } | { success: false },
    permiteNovaTentativa: boolean,
  ): Promise<T | null> {
    for (let tentativa = 0; tentativa < (permiteNovaTentativa ? 2 : 1); tentativa++) {
      const tempo = restante();
      if (tempo < MIN_CHAMADA_MS) {
        if (tentativa === 0) throw new FalhaAgente("timeout");
        return null; // sem tempo para a nova tentativa
      }
      let resposta: RespostaJson;
      try {
        resposta = await cliente.gerarJson({ ...pedido, timeoutMs: Math.min(TIMEOUT_CHAMADA_MS, tempo) });
      } catch (e) {
        if (e instanceof FalhaAgente && e.tipo === "json_invalido") {
          chamadas.push({ nome: pedido.nome, uso: null, finishReason: e.detalhe ?? null, ms: 0, zodOk: false });
          continue;
        }
        throw e;
      }
      const v = validar(resposta.dados);
      chamadas.push({
        nome: pedido.nome,
        uso: resposta.uso,
        finishReason: resposta.finishReason,
        ms: resposta.ms,
        zodOk: v.success,
      });
      if (v.success) return v.data;
    }
    return null;
  }

  try {
    const cliente = typeof deps.cliente === "function" ? deps.cliente() : deps.cliente;

    // 1. Mascarar antes de qualquer chamada ao modelo.
    const texto = mascararPii(entrada.mensagem);

    // 2. Classificar; inválida mesmo após nova tentativa -> nao_classificado com confiança 0.
    const pc = promptClassificacao(texto);
    const cls = await chamar(
      cliente,
      { nome: "classificacao", ...pc, esquema: ESQUEMA_CLASSIFICACAO, maxTokens: MAX_TOKENS_CLASSIFICACAO },
      (d) => Classificacao.safeParse(d),
      true,
    );
    const classificacaoValida = cls !== null;
    const c = cls ?? CLASSIFICACAO_INVALIDA;
    confianca = c.confianca;

    // 3. Sinais: "ou" entre o modelo e as palavras-chave.
    const re = detectarSinais(texto);
    sinais = { saude: c.saude || re.saude, ameaca: c.ameaca || re.ameaca };

    // 4. FAQ da conversa: calculada uma vez e usada igual no nível e na ação.
    const topico = c.topico ?? undefined;
    const faq = faqParaConsulta({ topico, saude: sinais.saude });

    // 5. Nível (código).
    motivos = ordenarMotivos(c.motivos, contexto.statusEntrega, faq);
    const principal = motivos[0];
    const decisao = decidirNivel({
      motivos,
      statusEntrega: contexto.statusEntrega,
      canal: contexto.canal,
      seq: contexto.seq,
      valor: contexto.valor,
      saude: sinais.saude,
      ameaca: sinais.ameaca,
      confianca: c.confianca,
      faqValidada: faq,
    });
    if (!classificacaoValida) decisao.razoes.unshift("classificação inválida: nao_classificado com confiança 0");

    // 6. Ação (código), com o mesmo conjunto de FAQ.
    let nivel = decisao.nivel;
    let acao = acaoSugerida(principal, nivel, contexto.statusEntrega, faq);

    const base = {
      motivos,
      motivoPrincipal: principal,
      topico: c.topico,
      confianca: c.confianca,
      classificacaoValida,
      sinais,
      falha: null,
      chamadas,
    };

    // 7a. Nível 2: só resumo interno, montado em código; nenhuma resposta ao cliente.
    if (nivel === 2) {
      const guias = unicasPorId(motivos.flatMap((m) => guiaInterno(m)));
      return {
        ...base,
        nivel,
        razoes: decisao.razoes,
        acao,
        resposta: null,
        resumoInterno: montarResumo({ motivos, sinais, confianca: c.confianca, razoes: decisao.razoes, acao, guias }),
        faqUsada: guias.map((g) => g.id),
        checagem: null,
        fallback: false,
      };
    }

    // 7b. Níveis 0 e 1: redigir com FAQ e fatos do pedido, depois checar em código.
    const entradas = unicasPorId(motivos.flatMap((m) => buscarFaq({ motivo: m, topico, saude: sinais.saude })));
    const fatos = fatosDoPedido(contexto);
    const pr = promptRedacao({ textoMascarado: texto, nivel, acao, entradasFaq: entradas, fatos });
    const red = await chamar(
      cliente,
      { nome: "redacao", ...pr, esquema: ESQUEMA_REDACAO, maxTokens: MAX_TOKENS_REDACAO },
      (d) => Redacao.safeParse(d),
      true,
    );
    if (red === null) throw new FalhaAgente("json_invalido");

    const checagem = verificarResposta(red.resposta, {
      textosFaq: entradas.map((e) => e.texto),
      fatos,
      links: linksDe(entradas),
    });
    const razoes = [...decisao.razoes];
    let resposta = red.resposta;
    if (!checagem.ok) {
      resposta = TEXTO_RESERVA;
      if (nivel === 0) {
        nivel = 1;
        acao = acaoSugerida(principal, 1, contexto.statusEntrega, faq);
      }
      razoes.push(
        `checagem do texto reprovou (${checagem.falhas.join(", ")}): texto de reserva, prepara e aguarda aprovação (nível ${nivel})`,
      );
    }

    return {
      ...base,
      nivel,
      razoes,
      acao,
      resposta,
      resumoInterno: null,
      faqUsada: entradas.map((e) => e.id),
      checagem,
      fallback: !checagem.ok,
    };
  } catch (e) {
    // Qualquer falha: nível 2, sem resposta ao cliente e sem texto do erro original.
    const tipo: TipoFalhaPipeline = e instanceof FalhaAgente ? e.tipo : "interno";
    return resultadoFalha(tipo, { motivos, sinais, confianca, chamadas });
  }
}

// Resultado de falha no formato do pipeline (também usado pela rota para exceções fora dele).
export function resultadoFalha(
  tipo: TipoFalhaPipeline,
  parcial: {
    motivos?: Motivo[];
    sinais?: { saude: boolean; ameaca: boolean };
    confianca?: number | null;
    chamadas?: Chamada[];
  } = {},
): ResultadoAgente {
  const motivos = parcial.motivos ?? [];
  const sinais = parcial.sinais ?? { saude: false, ameaca: false };
  const confianca = parcial.confianca ?? null;
  return {
    nivel: 2,
    razoes: [RAZAO_FALHA],
    motivos,
    motivoPrincipal: motivos[0] ?? null,
    topico: null,
    confianca,
    classificacaoValida: false,
    sinais,
    acao: ACAO_FALHA,
    resposta: null,
    resumoInterno: montarResumo({ motivos, sinais, confianca, razoes: [`${RAZAO_FALHA} (${tipo})`], acao: ACAO_FALHA, guias: [] }),
    faqUsada: [],
    checagem: null,
    fallback: false,
    falha: { tipo },
    chamadas: parcial.chamadas ?? [],
  };
}

// Métrica: entre as conversas em que houve redação (níveis 0 e 1), quantas caíram no texto de reserva.
export function taxaFallback(resultados: readonly ResultadoAgente[]): {
  comRedacao: number;
  fallbacks: number;
  taxa: number | null;
} {
  const comRedacao = resultados.filter((r) => r.checagem !== null).length;
  const fallbacks = resultados.filter((r) => r.fallback).length;
  return { comRedacao, fallbacks, taxa: comRedacao === 0 ? null : fallbacks / comRedacao };
}

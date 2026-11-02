// Textos de apresentação da demonstração (puros e testáveis; usados no navegador).

import type { Autonomia } from "../acoes";
import type { ResultadoAgente, TipoFalhaPipeline } from "../agent";
import type { FalhaChecagem } from "../agent/checagem";
import { ABRE, FECHA, neutralizarDelimitador } from "../agent/prompts";
import { mascararPii } from "../pii";
import type { Nivel } from "../policy";

export const NIVEL: Readonly<Record<Nivel, { titulo: string; descricao: string; simbolo: string }>> = {
  0: { titulo: "Nível 0: o agente executa", descricao: "Responde e age sozinho, com base factual.", simbolo: "●" },
  1: {
    titulo: "Nível 1: prepara e aguarda aprovação",
    descricao: "O agente prepara a ação e a resposta; uma pessoa aprova.",
    simbolo: "◆",
  },
  2: {
    titulo: "Nível 2: humano obrigatório",
    descricao: "O agente só resume e prioriza; uma pessoa conduz o caso.",
    simbolo: "▲",
  },
};

export const AUTONOMIA: Readonly<Record<Autonomia, string>> = {
  executa: "Executa",
  prepara_e_aguarda_aprovacao: "Prepara e aguarda aprovação",
  escala_para_humano: "Escala para humano",
};

export const FALHA: Readonly<Record<TipoFalhaPipeline, string>> = {
  timeout: "o modelo demorou demais para responder",
  rate_limit: "o provedor do modelo atingiu o limite de uso",
  json_invalido: "o modelo devolveu uma resposta fora do formato esperado",
  config: "o servidor não está configurado para chamar o modelo",
  requisicao_recusada: "o provedor do modelo recusou a requisição",
  indisponivel: "o provedor do modelo está indisponível",
  interno: "houve um erro interno no servidor",
};

export const CHECAGEM: Readonly<Record<FalhaChecagem, string>> = {
  formato: "texto vazio ou longo demais",
  numero_sem_fonte: "número ou prazo sem fonte na FAQ ou no pedido",
  numero_por_extenso: "número escrito por extenso",
  compromisso: "promessa (verbo de compromisso)",
  dado_sensivel: "menciona CPF, cartão ou senha",
  link_sem_fonte: "link que não está na FAQ",
  acao_feita: "afirma que uma ação já foi feita",
  promessa_contato: "promete contato, retorno ou prazo, ou narra o que a equipe faz (nível 0)",
  termo_de_solucao: "promete solução, custo, resultado, prazo ou ressalva temporal que a FAQ usada não traz",
};

export const LIMITE: Readonly<Record<string, string>> = {
  ip_minuto: "limite por IP por minuto",
  ip_dia: "limite diário por IP",
  diario: "teto diário da demonstração",
};

export function rotuloLimite(limite: string): string {
  return LIMITE[limite] ?? "limite da demonstração";
}

export function horaBrasilia(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

// O que o modelo recebe: a mensagem mascarada (mesma função do servidor), com o delimitador neutralizado,
// entre as marcas. Calculado no navegador; a API não devolve a mensagem.
export function oQueOModeloViu(mensagem: string): string {
  return `${ABRE}\n${neutralizarDelimitador(mascararPii(mensagem.trim()))}\n${FECHA}`;
}

// Motivo real da contingência, exibido na faixa de resposta gravada.
export const MOTIVO_CONTINGENCIA: Readonly<Record<string, string>> = {
  ip_minuto: "limite por IP por minuto",
  ip_dia: "limite diário por IP",
  diario: "teto diário da demonstração",
  rate_limit: "limite de uso do provedor do modelo (rate_limit)",
  timeout: "o modelo demorou demais (timeout)",
  indisponivel: "provedor do modelo indisponível",
  config: "servidor sem configuração do modelo (config)",
  requisicao_recusada: "o provedor recusou a requisição",
  json_invalido: "o modelo respondeu fora do formato (json_invalido)",
};

export function rotuloMotivoContingencia(motivo: string): string {
  return MOTIVO_CONTINGENCIA[motivo] ?? motivo;
}

export function dataBrasilia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Bloco "Checagens do texto" quando não houve checagem: nível 2 não tem texto ao cliente; no nível 0 ou 1
// sem checagem (motivo não identificado), o texto é o de reserva, sem redação do modelo.
export function checagemNaoAplicavel(nivel: Nivel): string {
  return nivel === 2
    ? "Não se aplica: no nível 2 não há texto ao cliente."
    : "Não se aplica: texto de reserva, sem redação do modelo.";
}

// Checagens em frase positiva, para a lista com ✓ e ✗. O verificador avalia todas de uma vez (não para na
// primeira), então o que não está nas falhas passou. promessa_contato só existe no nível 0.
export const CHECAGEM_OK: Readonly<Record<FalhaChecagem, string>> = {
  formato: "tamanho do texto",
  numero_sem_fonte: "números e prazos com fonte",
  numero_por_extenso: "sem número por extenso",
  compromisso: "sem promessa",
  dado_sensivel: "não menciona CPF, cartão ou senha",
  link_sem_fonte: "só links da FAQ",
  acao_feita: "não narra ação como feita",
  promessa_contato: "não promete contato (nível 0)",
  termo_de_solucao: "solução e prazo só da FAQ",
};

export interface ItemChecagem {
  id: FalhaChecagem;
  ok: boolean;
  rotulo: string;
}

export function itensDaChecagem(checagem: { falhas: readonly FalhaChecagem[] }, nivel: Nivel): ItemChecagem[] {
  return (Object.keys(CHECAGEM_OK) as FalhaChecagem[])
    .filter((id) => id !== "promessa_contato" || nivel === 0 || checagem.falhas.includes(id))
    .map((id) => {
      const reprovou = checagem.falhas.includes(id);
      return { id, ok: !reprovou, rotulo: reprovou ? CHECAGEM[id] : CHECAGEM_OK[id] };
    });
}

// Faixa do pipeline: só com o que a resposta já traz.
export type EstadoEtapa = "ok" | "gravada" | "falhou" | "pulada" | "nao_informada";

export interface Etapa {
  id: "mascarar" | "classificar" | "decidir" | "redigir" | "checar";
  nome: string;
  estado: EstadoEtapa;
  detalhe: string;
  levouAoNivel: boolean;
}

export const ESTADO_ETAPA: Readonly<Record<EstadoEtapa, { icone: string; rotulo: string }>> = {
  ok: { icone: "✓", rotulo: "rodou" },
  gravada: { icone: "↺", rotulo: "gravada" },
  falhou: { icone: "✗", rotulo: "falhou" },
  pulada: { icone: "–", rotulo: "não rodou" },
  nao_informada: { icone: "?", rotulo: "não informado" },
};

type RespostaPipeline = Pick<
  ResultadoAgente,
  "nivel" | "motivoPrincipal" | "checagem" | "fallback" | "falha" | "chamadas" | "tentativasRedacao"
> & { contingencia?: unknown };

export function etapasDoPipeline(r: RespostaPipeline): Etapa[] {
  const gravada = r.contingencia !== undefined;
  const chamadas = (nome: string) => r.chamadas.filter((c) => c.nome === nome);
  const classificou = chamadas("classificacao").some((c) => c.zodOk);
  const redigiu = chamadas("redacao").some((c) => c.zodOk);
  const semChamada = r.chamadas.length === 0;
  const doModelo = gravada ? "gravada" : "ok";

  // Sem chamada alguma, config e interno podem ter parado antes do mascaramento; a resposta não diz.
  const mascarar: Etapa = {
    id: "mascarar",
    nome: "Mascarar",
    levouAoNivel: false,
    ...(r.falha && semChamada && (r.falha.tipo === "config" || r.falha.tipo === "interno")
      ? { estado: "nao_informada" as const, detalhe: "parou antes do modelo" }
      : { estado: "ok" as const, detalhe: "dados pessoais" }),
  };

  const classificar: Etapa = {
    id: "classificar",
    nome: "Classificar",
    levouAoNivel: r.falha !== null && !classificou,
    ...(classificou
      ? { estado: doModelo, detalhe: r.motivoPrincipal ?? "sem motivo" }
      : { estado: "falhou" as const, detalhe: r.falha ? "não concluiu" : "fora do formato" }),
  };

  // Sem falha, quem define o nível é sempre a regra em código, mesmo com classificação inválida.
  const decidir: Etapa = {
    id: "decidir",
    nome: "Decidir nível",
    levouAoNivel: r.falha === null,
    ...(r.falha === null
      ? { estado: "ok" as const, detalhe: `regra em código: nível ${r.nivel}` }
      : classificou
        ? { estado: "ok" as const, detalhe: "regra em código" }
        : { estado: "pulada" as const, detalhe: "falha: nível 2" }),
  };

  let redigir: Etapa;
  if (r.falha && classificou) {
    redigir = { id: "redigir", nome: "Redigir", estado: "falhou", detalhe: "não concluiu", levouAoNivel: true };
  } else if (redigiu) {
    const detalhe = r.tentativasRedacao === 2 ? "duas redações" : "uma redação";
    redigir = { id: "redigir", nome: "Redigir", estado: doModelo, detalhe, levouAoNivel: false };
  } else {
    const detalhe = r.nivel === 2 ? "sem texto ao cliente" : "texto de reserva";
    redigir = { id: "redigir", nome: "Redigir", estado: "pulada", detalhe, levouAoNivel: false };
  }

  // Reprovada duas vezes, a checagem usa o texto de reserva e leva o nível 0 ao 1; se a regra já tinha dado
  // nível 1, nada muda. A resposta não distingue os dois casos, então a faixa não atribui o nível à checagem.
  const checar: Etapa = {
    id: "checar",
    nome: "Checar",
    levouAoNivel: false,
    ...(r.checagem === null
      ? { estado: "pulada" as const, detalhe: "sem texto redigido" }
      : r.checagem.ok
        ? { estado: "ok" as const, detalhe: "aprovado" }
        : { estado: "falhou" as const, detalhe: "reprovou: texto de reserva" }),
  };

  return [mascarar, classificar, decidir, redigir, checar];
}

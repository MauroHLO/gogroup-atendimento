// Textos de apresentação da demonstração (puros e testáveis; usados no navegador).

import type { Autonomia } from "../acoes";
import type { TipoFalhaPipeline } from "../agent";
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
  termo_de_solucao: "promete solução, custo ou resultado que a FAQ usada não traz",
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

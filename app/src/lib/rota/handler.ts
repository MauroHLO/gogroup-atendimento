// Handler da rota pública POST /api/agent (docs/decisoes.md, seção 15).
// Fica fora de app/api/agent/route.ts porque o Next valida os nomes exportados pelo arquivo de rota.
// Ordem: origem -> tamanho -> JSON e zod -> limites -> pipeline. Qualquer exceção: 200 no formato do
// pipeline, nível 2, falha "interno". Nenhum texto de conversa nem de erro vai para log ou resposta.

import { z } from "zod";
import { processarConversa, resultadoFalha, type Dependencias, type ResultadoAgente } from "../agent";
import {
  consumirTodos,
  DESLOCAMENTO_BRASILIA_MS,
  DIA_MS,
  LimitadorJanela,
  MINUTO_MS,
} from "../limites";
import type { Canal, StatusEntrega } from "../policy";

export const LIMITE_MENSAGEM = 2_000; // caracteres
export const LIMITE_CORPO_BYTES = 10 * 1024;
export const LIMITE_IP_MINUTO = 10;
export const LIMITE_IP_DIA = 100;
export const LIMITE_DIARIO_GLOBAL_PADRAO = 300; // sobrescrito por LIMITE_DIARIO_GLOBAL
export const MENSAGEM_LIMITE = "limite da demonstração atingido";

const STATUS = ["em_separacao", "em_transito", "entregue", "atrasado", "aguardando_pagamento"] as const;
const CANAIS = ["whatsapp", "email", "reclame_aqui"] as const;
// Falha de compilação se os tipos da policy ganharem valores que não estão aqui.
const _statusCompleto: Record<StatusEntrega, true> = Object.fromEntries(STATUS.map((s) => [s, true])) as Record<
  (typeof STATUS)[number],
  true
>;
const _canaisCompletos: Record<Canal, true> = Object.fromEntries(CANAIS.map((c) => [c, true])) as Record<
  (typeof CANAIS)[number],
  true
>;
void _statusCompleto;
void _canaisCompletos;

export const CorpoAgente = z.object({
  mensagem: z.string().trim().min(1).max(LIMITE_MENSAGEM),
  contexto: z.object({
    statusEntrega: z.enum(STATUS),
    canal: z.enum(CANAIS),
    valor: z.number().finite().min(0).max(10_000),
    seq: z.number().int().min(1).max(20),
  }),
});
export type CorpoAgente = z.infer<typeof CorpoAgente>;

export type NomeLimite = "ip_minuto" | "ip_dia" | "diario";

export interface Limites {
  ipMinuto: LimitadorJanela;
  ipDia: LimitadorJanela;
  global: LimitadorJanela;
}

export function lerLimiteGlobal(env: Readonly<Record<string, string | undefined>>): number {
  const bruto = env.LIMITE_DIARIO_GLOBAL?.trim();
  if (!bruto || !/^\d+$/.test(bruto)) return LIMITE_DIARIO_GLOBAL_PADRAO;
  return Number(bruto);
}

export function criarLimitesPadrao(
  env: Readonly<Record<string, string | undefined>> = process.env,
  agora: () => number = Date.now,
): Limites {
  const dia = { janelaMs: DIA_MS, deslocamentoMs: DESLOCAMENTO_BRASILIA_MS, agora };
  return {
    ipMinuto: new LimitadorJanela({ limite: LIMITE_IP_MINUTO, janelaMs: MINUTO_MS, agora }),
    ipDia: new LimitadorJanela({ limite: LIMITE_IP_DIA, ...dia }),
    global: new LimitadorJanela({ limite: lerLimiteGlobal(env), ...dia }),
  };
}

export interface DepsRota {
  cliente: Dependencias["cliente"];
  limites: Limites;
  modelo?: string;
  agora?: () => number;
  log?: (linha: string) => void;
  processar?: typeof processarConversa;
}

// Linha de log: só métricas, sem IP, mensagem nem erro.
export interface LinhaLog {
  nivel: 0 | 1 | 2 | null;
  falha: string | null;
  ms: number;
  chamadas: number;
}

const CABECALHOS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: CABECALHOS });
}

// Preferência: x-real-ip e x-vercel-forwarded-for (definidos pela Vercel); x-forwarded-for como alternativa.
export function ipDaRequisicao(h: Headers): string {
  for (const nome of ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]) {
    const valor = h.get(nome)?.split(",")[0]?.trim();
    if (valor) return valor;
  }
  return "desconhecido";
}

export function mesmaOrigem(h: Headers): boolean {
  const origem = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origem || !host) return false;
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  try {
    return new URL(origem).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

// Lê o corpo com teto de bytes, mesmo sem Content-Length (envio em partes). null = grande demais.
async function lerCorpo(req: Request, limite: number): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > limite) return null;
  if (!req.body) return "";
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    tudo.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(tudo);
}

export function criarHandler(deps: DepsRota): (req: Request) => Promise<Response> {
  const agora = deps.agora ?? Date.now;
  const log = deps.log ?? ((linha: string) => console.log(linha));
  const processar = deps.processar ?? processarConversa;

  function registrar(l: LinhaLog): void {
    try {
      log(JSON.stringify(l));
    } catch {
      // log nunca derruba a resposta
    }
  }

  return async function POST(req: Request): Promise<Response> {
    const inicio = agora();
    const ms = () => agora() - inicio;
    try {
      if (!mesmaOrigem(req.headers)) {
        registrar({ nivel: null, falha: "origem", ms: ms(), chamadas: 0 });
        return json({ erro: "origem não permitida" }, 403);
      }

      let texto: string | null;
      try {
        texto = await lerCorpo(req, LIMITE_CORPO_BYTES);
      } catch {
        texto = ""; // UTF-8 inválido ou leitura interrompida: cai na validação
      }
      if (texto === null) {
        registrar({ nivel: null, falha: "tamanho", ms: ms(), chamadas: 0 });
        return json({ erro: "mensagem grande demais" }, 413);
      }

      let bruto: unknown;
      try {
        bruto = JSON.parse(texto);
      } catch {
        bruto = undefined;
      }
      const corpo = CorpoAgente.safeParse(bruto);
      if (!corpo.success) {
        registrar({ nivel: null, falha: "entrada", ms: ms(), chamadas: 0 });
        return json({ erro: "entrada inválida" }, 400);
      }

      const ip = ipDaRequisicao(req.headers);
      const limite = consumirTodos([
        { limitador: deps.limites.ipMinuto, chave: ip, nome: "ip_minuto" },
        { limitador: deps.limites.ipDia, chave: ip, nome: "ip_dia" },
        { limitador: deps.limites.global, chave: "global", nome: "diario" },
      ]);
      if (!limite.ok) {
        registrar({ nivel: null, falha: `limite_${limite.nome}`, ms: ms(), chamadas: 0 });
        return json(
          { erro: MENSAGEM_LIMITE, limite: limite.nome as NomeLimite, reiniciaEm: new Date(limite.reiniciaEm).toISOString() },
          429,
        );
      }

      const resultado: ResultadoAgente = await processar(
        { mensagem: corpo.data.mensagem, contexto: corpo.data.contexto },
        { cliente: deps.cliente },
      );
      registrar({ nivel: resultado.nivel, falha: resultado.falha?.tipo ?? null, ms: ms(), chamadas: resultado.chamadas.length });
      return json({ ...resultado, modelo: deps.modelo ?? null });
    } catch {
      const resultado = resultadoFalha("interno");
      registrar({ nivel: 2, falha: "interno", ms: ms(), chamadas: 0 });
      return json({ ...resultado, modelo: deps.modelo ?? null });
    }
  };
}

// Avaliação do classificador (docs/decisoes.md, seção 16). Ferramenta local; fora do npm test.
// Uso: python analysis/avaliacao_classificador.py amostra   (gera data/interim/avaliacao/entrada.jsonl)
//      cd app && npm run avaliar-classificador              (este script)
//      python analysis/avaliacao_classificador.py metricas  (agregados em data/processed/)
//
// Para cada mensagem: mascara (lib/pii), monta o prompt de classificação de produção e chama o Groq
// (só a classificação; sem redação), com a mesma nova tentativa do pipeline para saída inválida.
// Depois calcula, com o código do app (ordenarMotivos, faqParaConsulta, detectarSinais, decidirNivel):
// - nível previsto: motivos, tópico, confiança e sinais do modelo ("ou" com as palavras-chave), como no pipeline;
// - nível de referência (só na amostra): motivos, tópico e sinais de data/interim/avaliacao/rotulos.csv,
//   confiança 1, mesmo contexto do pedido.
// Grava data/interim/avaliacao/llm.jsonl (fora do Git), uma linha por mensagem, SEM texto de mensagem.
// Retoma de onde parou: itens já presentes em llm.jsonl não são chamados de novo.
// Pausa entre chamadas; em rate_limit, espera o retry-after (ou 20 s) e repete, até 5 vezes.
// Nunca imprime a chave nem o texto das mensagens.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import Groq from "groq-sdk";
import { ordenarMotivos } from "../src/lib/agent";
import {
  criarClienteGroq,
  FalhaAgente,
  MAX_TOKENS_CLASSIFICACAO,
  TIMEOUT_CHAMADA_MS,
  type ClienteLLM,
  type SdkChat,
} from "../src/lib/agent/cliente";
import { Classificacao, CLASSIFICACAO_INVALIDA, ESQUEMA_CLASSIFICACAO } from "../src/lib/agent/esquema";
import { promptClassificacao, type ContextoPedido } from "../src/lib/agent/prompts";
import { detectarSinais } from "../src/lib/agent/sinais";
import { faqParaConsulta } from "../src/lib/faq";
import { mascararPii } from "../src/lib/pii";
import { decidirNivel, type Motivo } from "../src/lib/policy";

const PASTA = path.resolve(process.cwd(), "../data/interim/avaliacao"); // rodar de app/
const ENTRADA = path.join(PASTA, "entrada.jsonl");
const ROTULOS = path.join(PASTA, "rotulos.csv");
const SAIDA = path.join(PASTA, "llm.jsonl");
const PAUSA_MS = 8_000;
const ESPERA_RATE_LIMIT_MS = 20_000;
const REPETICOES_RATE_LIMIT = 5;

interface Item {
  id: string;
  conjunto: "amostra" | "saude" | "ameaca";
  texto: string;
  contexto: ContextoPedido;
}

interface Rotulo {
  motivos: Motivo[];
  saude: boolean;
  ameaca: boolean;
  topico: string | undefined;
}

let ultimoRetryAfterMs: number | null = null;

function lerRetryAfter(e: unknown): number | null {
  const h = (e as { headers?: { get?: (n: string) => string | null } } | null)?.headers;
  const bruto = typeof h?.get === "function" ? h.get("retry-after") : null;
  if (!bruto) return null;
  const s = Number(bruto);
  return Number.isFinite(s) && s >= 0 ? Math.ceil(s * 1000) : null;
}

function sdkQueLeRetryAfter(chave: string): SdkChat {
  const groq = new Groq({ apiKey: chave, maxRetries: 0 }) as unknown as SdkChat;
  return {
    chat: {
      completions: {
        async create(...args: Parameters<SdkChat["chat"]["completions"]["create"]>) {
          try {
            return await groq.chat.completions.create(...args);
          } catch (e) {
            ultimoRetryAfterMs = lerRetryAfter(e);
            throw e;
          }
        },
      },
    },
  } as SdkChat;
}

function lerRotulos(): Map<string, Rotulo> {
  const linhas = readFileSync(ROTULOS, "utf-8").trim().split(/\r?\n/).slice(1);
  const mapa = new Map<string, Rotulo>();
  for (const l of linhas) {
    const [id, motivos, saude, ameaca, topico] = l.split(",");
    mapa.set(id, {
      motivos: motivos ? (motivos.split("|") as Motivo[]) : [],
      saude: saude === "1",
      ameaca: ameaca === "1",
      topico: topico || undefined,
    });
  }
  return mapa;
}

// Mesma lógica do pipeline: uma nova tentativa para saída inválida; inválida duas vezes -> nao_classificado.
async function classificar(cliente: ClienteLLM, texto: string): Promise<{ c: Classificacao; valida: boolean }> {
  const p = promptClassificacao(texto);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await cliente.gerarJson({
        nome: "classificacao",
        ...p,
        esquema: ESQUEMA_CLASSIFICACAO,
        maxTokens: MAX_TOKENS_CLASSIFICACAO,
        timeoutMs: TIMEOUT_CHAMADA_MS,
      });
      const v = Classificacao.safeParse(r.dados);
      if (v.success) return { c: v.data, valida: true };
    } catch (e) {
      if (!(e instanceof FalhaAgente && e.tipo === "json_invalido")) throw e;
    }
  }
  return { c: CLASSIFICACAO_INVALIDA, valida: false };
}

function nivelDe(motivos: readonly Motivo[], topico: string | undefined, saude: boolean, ameaca: boolean, confianca: number, ctx: ContextoPedido) {
  const faq = faqParaConsulta({ topico, saude });
  const ordenados = ordenarMotivos(motivos, ctx.statusEntrega, faq);
  const d = decidirNivel({
    motivos: ordenados,
    statusEntrega: ctx.statusEntrega,
    canal: ctx.canal,
    seq: ctx.seq,
    valor: ctx.valor,
    saude,
    ameaca,
    confianca,
    faqValidada: faq,
  });
  return { ordenados, nivel: d.nivel };
}

async function main(): Promise<number> {
  const chave = process.env.GROQ_API_KEY?.trim();
  if (!chave) {
    console.error("GROQ_API_KEY ausente em app/.env.local");
    return 2;
  }
  const cliente = criarClienteGroq(process.env, sdkQueLeRetryAfter(chave));
  const itens: Item[] = readFileSync(ENTRADA, "utf-8").trim().split(/\r?\n/).map((l) => JSON.parse(l));
  const rotulos = lerRotulos();
  const feitos = new Set(
    existsSync(SAIDA) ? readFileSync(SAIDA, "utf-8").trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).id) : [],
  );
  const pendentes = itens.filter((i) => !feitos.has(i.id));
  console.log(`modelo=${cliente.modelo} | itens=${itens.length} | já feitos=${feitos.size} | pendentes=${pendentes.length}`);

  for (const [n, item] of pendentes.entries()) {
    if (n > 0) await esperar(PAUSA_MS);
    let res: { c: Classificacao; valida: boolean } | null = null;
    let falha: string | null = null;
    for (let tentativa = 0; tentativa <= REPETICOES_RATE_LIMIT; tentativa++) {
      ultimoRetryAfterMs = null;
      try {
        res = await classificar(cliente, mascararPii(item.texto));
        break;
      } catch (e) {
        const tipo = e instanceof FalhaAgente ? e.tipo : "interno";
        if ((tipo !== "rate_limit" && tipo !== "timeout") || tentativa === REPETICOES_RATE_LIMIT) {
          falha = tipo;
          break;
        }
        const espera = tipo === "rate_limit" ? (ultimoRetryAfterMs ?? ESPERA_RATE_LIMIT_MS) : 5_000;
        if (espera > 10 * 60_000) {
          console.error(`${item.id}: rate_limit com espera de ${Math.round(espera / 60_000)} min (cota diária?); pare e retome depois.`);
          return 3;
        }
        console.log(`${item.id}: ${tipo}; esperando ${Math.round(espera / 1000)} s (repetição ${tentativa + 1})`);
        await esperar(espera);
      }
    }
    if (!res) {
      console.error(`${item.id}: falhou (${falha}); pare e retome depois.`);
      return 3;
    }
    const { c, valida } = res;
    const sinaisRe = detectarSinais(mascararPii(item.texto));
    const saudeFinal = c.saude || sinaisRe.saude;
    const ameacaFinal = c.ameaca || sinaisRe.ameaca;
    const prev = nivelDe(c.motivos, c.topico ?? undefined, saudeFinal, ameacaFinal, c.confianca, item.contexto);
    const linha: Record<string, unknown> = {
      id: item.id,
      motivos: prev.ordenados,
      motivoPrincipal: prev.ordenados[0],
      topico: c.topico,
      confianca: c.confianca,
      classificacaoValida: valida,
      saudeModelo: c.saude,
      ameacaModelo: c.ameaca,
      saudeRegexApp: sinaisRe.saude,
      ameacaRegexApp: sinaisRe.ameaca,
      saudeFinal,
      ameacaFinal,
      nivelPrevisto: prev.nivel,
    };
    const rot = item.conjunto === "amostra" ? rotulos.get(item.id) : undefined;
    if (rot && rot.motivos.length > 0) {
      const ref = nivelDe(rot.motivos, rot.topico, rot.saude, rot.ameaca, 1, item.contexto);
      linha.motivosRef = ref.ordenados;
      linha.motivoRef = ref.ordenados[0];
      linha.nivelRef = ref.nivel;
    }
    appendFileSync(SAIDA, JSON.stringify(linha) + "\n", "utf-8");
    console.log(`${n + 1}/${pendentes.length} ${item.id}: ok`);
  }
  console.log("concluído");
  return 0;
}

main().then((codigo) => process.exit(codigo));

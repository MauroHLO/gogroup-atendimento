// Esquemas da saída do modelo (docs/decisoes.md, seção 14).
// O zod valida tudo; o esquema JSON enviado ao Groq no modo estrito é derivado dele.

import { z } from "zod";
import { NIVEL_BASE, type Motivo } from "../policy";
import { TOPICOS_POLITICA } from "../faq";

export const MOTIVOS = Object.keys(NIVEL_BASE) as [Motivo, ...Motivo[]];
export const MAX_RESPOSTA = 700; // caracteres

// z.object descarta campos extras (ex.: "nivel" ou "acao" vindos do modelo): o modelo nunca decide.
export const Classificacao = z.object({
  motivos: z.array(z.enum(MOTIVOS)).min(1).max(3),
  topico: z.enum(TOPICOS_POLITICA).nullable(),
  confianca: z.number().min(0).max(1),
  saude: z.boolean(),
  ameaca: z.boolean(),
});
export type Classificacao = z.infer<typeof Classificacao>;

export const Redacao = z.object({
  resposta: z.string().trim().min(1).max(MAX_RESPOSTA),
});
export type Redacao = z.infer<typeof Redacao>;

export const CLASSIFICACAO_INVALIDA: Classificacao = {
  motivos: ["nao_classificado"],
  topico: null,
  confianca: 0,
  saude: false,
  ameaca: false,
};

// Palavras-chave que o modo estrito do Groq não documenta: os limites ficam só no zod.
const SEM_SUPORTE_DOCUMENTADO = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
]);

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function limpar(no: Json): Json {
  if (Array.isArray(no)) return no.map(limpar);
  if (no === null || typeof no !== "object") return no;
  const saida: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(no)) {
    if (!SEM_SUPORTE_DOCUMENTADO.has(k)) saida[k] = limpar(v);
  }
  // Modo estrito: todo objeto fechado e com todas as propriedades obrigatórias.
  if (saida.type === "object" && saida.properties && typeof saida.properties === "object") {
    saida.additionalProperties = false;
    saida.required = Object.keys(saida.properties as object);
  }
  return saida;
}

export function esquemaEstrito(esquema: z.ZodType): Record<string, Json> {
  return limpar(z.toJSONSchema(esquema) as Json) as Record<string, Json>;
}

export const ESQUEMA_CLASSIFICACAO = esquemaEstrito(Classificacao);
export const ESQUEMA_REDACAO = esquemaEstrito(Redacao);

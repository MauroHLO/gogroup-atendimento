// Cliente do modelo (docs/decisoes.md, seção 14).
// Interface injetável: os testes usam um cliente ou um SDK falso, sem rede.
// A chave vem só de GROQ_API_KEY e o modelo de GROQ_MODEL. Erros do SDK nunca são repassados:
// viram FalhaAgente com um tipo, sem a mensagem original.

import Groq, {
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "groq-sdk";

export const MODELO_PADRAO = "openai/gpt-oss-20b";

// Modelos com saída estruturada estrita (decodificação restrita), segundo a documentação do Groq.
export const MODELOS_ESTRITOS: ReadonlySet<string> = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "meta-models/muse-spark-open",
]);

// Calibrados com scripts/smoke-groq.ts em 31/10/2026 (decisoes.md, seção 14): máximo medido de 128 tokens
// na classificação e 87 na redação, raciocínio incluído. Folga de cerca de 3x e 4,5x.
export const MAX_TOKENS_CLASSIFICACAO = 384;
export const MAX_TOKENS_REDACAO = 400;
export const TIMEOUT_CHAMADA_MS = 8_000;

export type TipoFalha =
  | "timeout"
  | "rate_limit"
  | "json_invalido"
  | "config" // chave ausente ou recusada, modelo inexistente
  | "requisicao_recusada" // 400 que não é JSON inválido (ex.: esquema estrito recusado)
  | "indisponivel"; // conexão ou erro 5xx

// Detalhe seguro do JSON inválido (nunca texto do SDK nem do modelo), útil para diagnóstico.
export type DetalheJsonInvalido = "length" | "vazio" | "parse" | "api";

export class FalhaAgente extends Error {
  constructor(
    readonly tipo: TipoFalha,
    readonly detalhe?: DetalheJsonInvalido,
  ) {
    super(`falha do agente: ${tipo}`); // nunca inclui a mensagem do SDK
    this.name = "FalhaAgente";
  }
}

export interface PedidoJson {
  nome: "classificacao" | "redacao";
  sistema: string;
  usuario: string;
  esquema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
}

export interface Uso {
  entrada: number;
  saida: number;
  raciocinio: number | null; // incluído em "saida", quando a API informa
}

export interface RespostaJson {
  dados: unknown; // JSON já interpretado; a validação com zod fica no pipeline
  uso: Uso | null;
  finishReason: string | null;
  ms: number;
}

export interface ClienteLLM {
  readonly modelo: string;
  readonly estrito: boolean;
  gerarJson(pedido: PedidoJson): Promise<RespostaJson>;
}

// Subconjunto do SDK que usamos (permite injetar um SDK falso nos testes).
export interface SdkChat {
  chat: { completions: { create(body: never, options?: never): Promise<unknown> } };
}

interface CompletionMinima {
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
}

function codigoErro(e: BadRequestError): string | undefined {
  const corpo = e.error as { code?: unknown; error?: { code?: unknown } } | undefined;
  const codigo = corpo?.error?.code ?? corpo?.code;
  return typeof codigo === "string" ? codigo : undefined;
}

export function tipoDoErro(e: unknown): TipoFalha {
  if (e instanceof FalhaAgente) return e.tipo;
  if (e instanceof APIConnectionTimeoutError || e instanceof APIUserAbortError) return "timeout";
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) return "timeout";
  if (e instanceof RateLimitError) return "rate_limit";
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError || e instanceof NotFoundError) {
    return "config";
  }
  if (e instanceof BadRequestError) {
    return codigoErro(e) === "json_validate_failed" ? "json_invalido" : "requisicao_recusada";
  }
  return "indisponivel";
}

export function criarClienteGroq(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sdk?: SdkChat,
): ClienteLLM {
  const chave = env.GROQ_API_KEY?.trim();
  if (!chave && !sdk) throw new FalhaAgente("config");
  const modelo = env.GROQ_MODEL?.trim() || MODELO_PADRAO;
  const estrito = MODELOS_ESTRITOS.has(modelo);
  const raciocinio = modelo.startsWith("openai/gpt-oss-");
  const api: SdkChat = sdk ?? (new Groq({ apiKey: chave, maxRetries: 0 }) as unknown as SdkChat);

  return {
    modelo,
    estrito,
    async gerarJson(pedido: PedidoJson): Promise<RespostaJson> {
      const body = {
        model: modelo,
        messages: [
          { role: "system", content: pedido.sistema },
          { role: "user", content: pedido.usuario },
        ],
        max_completion_tokens: pedido.maxTokens,
        temperature: 0,
        response_format: estrito
          ? { type: "json_schema", json_schema: { name: pedido.nome, schema: pedido.esquema, strict: true } }
          : { type: "json_object" },
        ...(raciocinio ? { reasoning_effort: "low", include_reasoning: false } : {}),
      };
      const options = {
        timeout: pedido.timeoutMs,
        maxRetries: 0,
        signal: AbortSignal.timeout(pedido.timeoutMs),
      };

      const inicio = Date.now();
      let resposta: CompletionMinima;
      try {
        resposta = (await api.chat.completions.create(body as never, options as never)) as CompletionMinima;
      } catch (e) {
        const tipo = tipoDoErro(e);
        throw new FalhaAgente(tipo, tipo === "json_invalido" ? "api" : undefined);
      }

      const escolha = resposta.choices?.[0];
      // Resposta cortada pelo limite de tokens é tratada como JSON inválido.
      if (escolha?.finish_reason === "length") throw new FalhaAgente("json_invalido", "length");
      const conteudo = escolha?.message?.content;
      if (typeof conteudo !== "string" || conteudo.trim() === "") throw new FalhaAgente("json_invalido", "vazio");

      let dados: unknown;
      try {
        dados = JSON.parse(conteudo);
      } catch {
        throw new FalhaAgente("json_invalido", "parse");
      }
      const u = resposta.usage;
      return {
        dados,
        uso: u
          ? {
              entrada: u.prompt_tokens ?? 0,
              saida: u.completion_tokens ?? 0,
              raciocinio: u.completion_tokens_details?.reasoning_tokens ?? null,
            }
          : null,
        finishReason: escolha?.finish_reason ?? null,
        ms: Date.now() - inicio,
      };
    },
  };
}

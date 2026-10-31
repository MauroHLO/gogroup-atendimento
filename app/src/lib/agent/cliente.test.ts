import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
} from "groq-sdk";
import {
  criarClienteGroq,
  FalhaAgente,
  MODELO_PADRAO,
  tipoDoErro,
  type PedidoJson,
  type SdkChat,
} from "./cliente";
import { ESQUEMA_CLASSIFICACAO } from "./esquema";

const CHAVE_FICTICIA = "gsk_ficticia_para_teste";
const pedido: PedidoJson = {
  nome: "classificacao",
  sistema: "sistema",
  usuario: "usuario",
  esquema: ESQUEMA_CLASSIFICACAO,
  maxTokens: 512,
  timeoutMs: 5_000,
};

interface Chamada {
  body: Record<string, unknown>;
  options: Record<string, unknown>;
}

function sdkFalso(resposta: unknown | (() => unknown)): { sdk: SdkChat; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const sdk = {
    chat: {
      completions: {
        async create(body: Record<string, unknown>, options: Record<string, unknown>) {
          chamadas.push({ body, options });
          return typeof resposta === "function" ? (resposta as () => unknown)() : resposta;
        },
      },
    },
  } as unknown as SdkChat;
  return { sdk, chamadas };
}

function completion(conteudo: string | null, finish = "stop") {
  return {
    choices: [{ finish_reason: finish, message: { content: conteudo } }],
    usage: { prompt_tokens: 300, completion_tokens: 40 },
  };
}

const env = (extra: Record<string, string> = {}) => ({ GROQ_API_KEY: CHAVE_FICTICIA, ...extra });

describe("configuração", () => {
  it("sem GROQ_API_KEY lança FalhaAgente do tipo config", () => {
    expect(() => criarClienteGroq({})).toThrow(FalhaAgente);
    try {
      criarClienteGroq({ GROQ_API_KEY: "   " });
    } catch (e) {
      expect((e as FalhaAgente).tipo).toBe("config");
    }
  });

  it("modelo padrão é openai/gpt-oss-20b, com modo estrito", () => {
    const c = criarClienteGroq(env(), sdkFalso(completion("{}")).sdk);
    expect(c.modelo).toBe(MODELO_PADRAO);
    expect(MODELO_PADRAO).toBe("openai/gpt-oss-20b");
    expect(c.estrito).toBe(true);
  });

  it("GROQ_MODEL troca o modelo", () => {
    const c = criarClienteGroq(env({ GROQ_MODEL: "openai/gpt-oss-120b" }), sdkFalso(completion("{}")).sdk);
    expect(c.modelo).toBe("openai/gpt-oss-120b");
  });
});

describe("parâmetros enviados ao Groq", () => {
  it("modelo estrito: json_schema estrito, raciocínio baixo e oculto, limites e timeout", async () => {
    const { sdk, chamadas } = sdkFalso(completion('{"ok":true}'));
    await criarClienteGroq(env(), sdk).gerarJson(pedido);
    const { body, options } = chamadas[0];
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "classificacao", schema: ESQUEMA_CLASSIFICACAO, strict: true },
    });
    expect(body.reasoning_effort).toBe("low");
    expect(body.include_reasoning).toBe(false);
    expect(body.max_completion_tokens).toBe(512);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body.temperature).toBe(0);
    expect(body.messages).toEqual([
      { role: "system", content: "sistema" },
      { role: "user", content: "usuario" },
    ]);
    expect(options.timeout).toBe(5_000);
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("modelo fora da lista estrita: json_object e sem parâmetros de raciocínio", async () => {
    const { sdk, chamadas } = sdkFalso(completion('{"ok":true}'));
    const c = criarClienteGroq(env({ GROQ_MODEL: "llama-3.3-70b-versatile" }), sdk);
    expect(c.estrito).toBe(false);
    await c.gerarJson(pedido);
    expect(chamadas[0].body.response_format).toEqual({ type: "json_object" });
    expect(chamadas[0].body).not.toHaveProperty("reasoning_effort");
    expect(chamadas[0].body).not.toHaveProperty("include_reasoning");
  });
});

describe("resposta", () => {
  it("devolve JSON interpretado e uso de tokens", async () => {
    const r = await criarClienteGroq(env(), sdkFalso(completion('{"resposta":"Olá"}')).sdk).gerarJson(pedido);
    expect(r).toMatchObject({
      dados: { resposta: "Olá" },
      uso: { entrada: 300, saida: 40, raciocinio: null },
      finishReason: "stop",
    });
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("informa tokens de raciocínio quando a API devolve", async () => {
    const comRaciocinio = {
      ...completion('{"a":1}'),
      usage: { prompt_tokens: 10, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 30 } },
    };
    const r = await criarClienteGroq(env(), sdkFalso(comRaciocinio).sdk).gerarJson(pedido);
    expect(r.uso).toEqual({ entrada: 10, saida: 50, raciocinio: 30 });
  });

  it.each([
    ["finish_reason length", completion('{"resposta":"Olá"}', "length"), "length"],
    ["JSON quebrado", completion('{"resposta":'), "parse"],
    ["conteúdo nulo", completion(null), "vazio"],
    ["conteúdo vazio", completion("  "), "vazio"],
    ["sem choices", { choices: [] }, "vazio"],
  ])("%s vira json_invalido (%s)", async (_nome, resposta, detalhe) => {
    const c = criarClienteGroq(env(), sdkFalso(resposta).sdk);
    await expect(c.gerarJson(pedido)).rejects.toMatchObject({ name: "FalhaAgente", tipo: "json_invalido", detalhe });
  });
});

describe("erros do SDK", () => {
  const headers = new Headers();
  const segredo = "detalhe interno do SDK com trecho da mensagem do cliente";

  it.each([
    ["timeout de conexão", new APIConnectionTimeoutError({ message: segredo }), "timeout"],
    ["abort por tempo", Object.assign(new Error(segredo), { name: "TimeoutError" }), "timeout"],
    ["429", new RateLimitError(429, { error: { message: segredo } }, segredo, headers), "rate_limit"],
    ["401", new AuthenticationError(401, { error: { message: segredo } }, segredo, headers), "config"],
    ["404 (modelo inexistente)", new NotFoundError(404, { error: { message: segredo } }, segredo, headers), "config"],
    [
      "400 json_validate_failed",
      new BadRequestError(400, { error: { message: segredo, code: "json_validate_failed" } }, segredo, headers),
      "json_invalido",
    ],
    [
      "400 esquema recusado",
      new BadRequestError(400, { error: { message: segredo, type: "invalid_request_error" } }, segredo, headers),
      "requisicao_recusada",
    ],
    ["500", new InternalServerError(500, { error: { message: segredo } }, segredo, headers), "indisponivel"],
    ["falha de conexão", new APIConnectionError({ message: segredo }), "indisponivel"],
    ["erro qualquer", new TypeError(segredo), "indisponivel"],
  ])("%s → %s, sem repassar a mensagem original", async (_nome, erro, tipo) => {
    expect(tipoDoErro(erro)).toBe(tipo);
    const c = criarClienteGroq(env(), sdkFalso(() => {
      throw erro;
    }).sdk);
    const falha = await c.gerarJson(pedido).catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(FalhaAgente);
    expect((falha as FalhaAgente).tipo).toBe(tipo);
    expect((falha as FalhaAgente).message).not.toContain(segredo);
    expect((falha as FalhaAgente).cause).toBeUndefined();
    expect(JSON.stringify(falha)).not.toContain(segredo);
  });

  it("FalhaAgente nunca contém a chave", async () => {
    const c = criarClienteGroq(env(), sdkFalso(() => {
      throw new AuthenticationError(401, { error: { message: CHAVE_FICTICIA } }, CHAVE_FICTICIA, headers);
    }).sdk);
    const falha = (await c.gerarJson(pedido).catch((e: unknown) => e)) as FalhaAgente;
    expect(falha.message).not.toContain(CHAVE_FICTICIA);
    expect(String(falha.stack)).not.toContain(CHAVE_FICTICIA);
  });
});

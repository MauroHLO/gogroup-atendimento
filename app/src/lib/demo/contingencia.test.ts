import { describe, expect, it } from "vitest";
import { FalhaAgente, type ClienteLLM } from "../agent/cliente";
import { LimitadorJanela, DIA_MS, MINUTO_MS } from "../limites";
import { criarHandler, type Limites } from "../rota/handler";
import {
  clienteGravado,
  exemploCorrespondente,
  GRAVACOES,
  INSTRUCAO_REGRAVAR,
  reproduzir,
  tentarContingencia,
} from "./contingencia";
import { EXEMPLOS } from "./exemplos";

const ORIGEM = "http://localhost:3000";

function requisicao(corpo: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGEM}/api/agent`, {
    method: "POST",
    headers: { origin: ORIGEM, host: "localhost:3000", "content-type": "application/json", "x-real-ip": "10.0.0.1", ...headers },
    body: JSON.stringify(corpo),
  });
}

// Cliente que falha o teste se for chamado (o replay nunca pode chamar o Groq).
const clienteProibido: ClienteLLM = {
  modelo: "proibido",
  estrito: true,
  async gerarJson() {
    throw new Error("o Groq não deveria ser chamado");
  },
};

function clienteQueFalha(tipo: ConstructorParameters<typeof FalhaAgente>[0]): ClienteLLM & { chamadas: number } {
  const c = {
    modelo: "falso",
    estrito: true,
    chamadas: 0,
    async gerarJson(): Promise<never> {
      c.chamadas++;
      throw new FalhaAgente(tipo);
    },
  };
  return c;
}

function limitesZerados(): Limites & { relogio: { t: number } } {
  const relogio = { t: 0 };
  const agora = () => relogio.t;
  return {
    relogio,
    ipMinuto: new LimitadorJanela({ limite: 10, janelaMs: MINUTO_MS, agora }),
    ipDia: new LimitadorJanela({ limite: 100, janelaMs: DIA_MS, agora }),
    global: new LimitadorJanela({ limite: 300, janelaMs: DIA_MS, agora }),
  };
}

function limitesCom(nome: "ip_minuto" | "ip_dia" | "diario"): Limites {
  const l = limitesZerados();
  const zero = (janelaMs: number) => new LimitadorJanela({ limite: 0, janelaMs, agora: () => l.relogio.t });
  if (nome === "ip_minuto") l.ipMinuto = zero(MINUTO_MS);
  if (nome === "ip_dia") l.ipDia = zero(DIA_MS);
  if (nome === "diario") l.global = zero(DIA_MS);
  return l;
}

const exemplo = EXEMPLOS[0];
const corpoExemplo = { mensagem: exemplo.mensagem, contexto: exemplo.contexto };

describe("arquivo de gravações", () => {
  it("é válido, com data, modelo e os 8 exemplos", () => {
    expect(GRAVACOES).not.toBeNull();
    expect(Number.isNaN(Date.parse(GRAVACOES!.gravadoEm))).toBe(false);
    expect(GRAVACOES!.modelo).toBeTruthy();
    expect(Object.keys(GRAVACOES!.exemplos).sort()).toEqual(EXEMPLOS.map((e) => e.id).sort());
  });

  it.each(EXEMPLOS.map((e) => [e.id, e] as const))("%s: o hash do prompt atual bate com o da gravação", async (id, e) => {
    const g = GRAVACOES!.exemplos[id];
    const { hash } = await reproduzir(e, g.passos, GRAVACOES!.modelo);
    expect(
      hash,
      `Os prompts que o pipeline manda ao modelo mudaram desde a gravação do exemplo "${id}" (prompt, FAQ, descrição de ação ou mascaramento). ${INSTRUCAO_REGRAVAR}`,
    ).toBe(g.hash);
  });

  it.each(EXEMPLOS.map((e) => [e.id, e] as const))("%s: a reprodução dá o nível esperado, sem falha", async (id, e) => {
    const { resultado } = await reproduzir(e, GRAVACOES!.exemplos[id].passos, GRAVACOES!.modelo);
    expect(resultado.falha).toBeNull();
    expect(resultado.classificacaoValida).toBe(true);
    expect(`nível ${resultado.nivel}`).toBe(e.esperado.slice(0, 7));
  });
});

describe("correspondência com exemplos prontos", () => {
  it("exige mensagem e contexto exatos (espaços nas pontas são ignorados)", () => {
    expect(exemploCorrespondente(`  ${exemplo.mensagem}  `, exemplo.contexto)?.id).toBe(exemplo.id);
    expect(exemploCorrespondente(exemplo.mensagem + "!", exemplo.contexto)).toBeNull();
    expect(exemploCorrespondente(exemplo.mensagem, { ...exemplo.contexto, seq: 3 })).toBeNull();
    expect(exemploCorrespondente(exemplo.mensagem, { ...exemplo.contexto, statusEntrega: "atrasado" })).toBeNull();
    expect(exemploCorrespondente("mensagem digitada à mão", exemplo.contexto)).toBeNull();
  });

  it("gravação ausente ou inválida desliga a contingência", async () => {
    expect(await tentarContingencia(exemplo.mensagem, exemplo.contexto, "timeout", null)).toBeNull();
    const semExemplo = { ...GRAVACOES!, exemplos: {} };
    expect(await tentarContingencia(exemplo.mensagem, exemplo.contexto, "timeout", semExemplo)).toBeNull();
  });

  it("gravação incompatível (passos fora de ordem) não é mostrada", async () => {
    const quebrada = { ...GRAVACOES!, exemplos: { [exemplo.id]: { hash: "x", passos: [] } } };
    expect(await tentarContingencia(exemplo.mensagem, exemplo.contexto, "timeout", quebrada)).toBeNull();
  });

  it("clienteGravado reproduz JSON inválido gravado", async () => {
    const c = clienteGravado([{ nome: "classificacao", erro: "json_invalido" }], "m");
    await expect(c.gerarJson({ nome: "classificacao", sistema: "", usuario: "", esquema: {}, maxTokens: 1, timeoutMs: 1 })).rejects.toMatchObject({
      tipo: "json_invalido",
    });
  });
});

describe("rota: replay quando a rota recusa por limite", () => {
  it.each(["ip_minuto", "ip_dia", "diario"] as const)(
    "%s + exemplo pronto: 200 com a gravação, motivo real, sem chamar o Groq",
    async (nome) => {
      const logs: string[] = [];
      const handler = criarHandler({ cliente: clienteProibido, limites: limitesCom(nome), log: (l) => logs.push(l) });
      const res = await handler(requisicao(corpoExemplo));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.contingencia).toEqual({ motivo: nome, gravadoEm: GRAVACOES!.gravadoEm, modelo: GRAVACOES!.modelo });
      expect(json.modelo).toBe(GRAVACOES!.modelo);
      expect(json.nivel).toBe(0);
      expect(json.falha).toBeNull();
      expect(JSON.parse(logs[0])).toMatchObject({ nivel: 0, falha: `gravada_${nome}`, chamadas: 0 });
      expect(Object.keys(JSON.parse(logs[0])).sort()).toEqual(["chamadas", "falha", "ms", "nivel"]);
    },
  );

  it("replay não consome cota", async () => {
    const l = limitesCom("diario");
    const handler = criarHandler({ cliente: clienteProibido, limites: l, log: () => {} });
    for (let i = 0; i < 3; i++) expect((await handler(requisicao(corpoExemplo))).status).toBe(200);
    expect(l.ipMinuto.verificar("10.0.0.1").restante).toBe(10);
    expect(l.ipDia.verificar("10.0.0.1").restante).toBe(100);
  });

  it("mensagem digitada à mão no limite: só 429 'limite da demonstração atingido'", async () => {
    const handler = criarHandler({ cliente: clienteProibido, limites: limitesCom("ip_minuto"), log: () => {} });
    const res = await handler(requisicao({ mensagem: "cadê meu pedido?", contexto: exemplo.contexto }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toMatchObject({ erro: "limite da demonstração atingido", limite: "ip_minuto" });
    expect(json).not.toHaveProperty("contingencia");
  });

  it("exemplo com contexto alterado no limite: 429, sem gravação", async () => {
    const handler = criarHandler({ cliente: clienteProibido, limites: limitesCom("ip_minuto"), log: () => {} });
    const res = await handler(requisicao({ ...corpoExemplo, contexto: { ...exemplo.contexto, seq: 3 } }));
    expect(res.status).toBe(429);
  });
});

describe("rota: replay quando o modelo falha", () => {
  it.each(["rate_limit", "timeout", "indisponivel", "config", "requisicao_recusada", "json_invalido"] as const)(
    "%s + exemplo pronto: gravação com o motivo real e decisão recalculada",
    async (tipo) => {
      const cliente = clienteQueFalha(tipo);
      const handler = criarHandler({ cliente, limites: limitesZerados(), log: () => {} });
      const json = await (await handler(requisicao(EXEMPLOS[1] && { mensagem: EXEMPLOS[1].mensagem, contexto: EXEMPLOS[1].contexto }))).json();
      expect(json.contingencia.motivo).toBe(tipo);
      expect(json.nivel).toBe(2); // reação adversa, recalculada pelo código
      expect(json.acao.acao).toBe("encaminhar_responsavel_tecnica");
      expect(json.falha).toBeNull();
      expect(cliente.chamadas).toBeGreaterThan(0); // tentou o Groq ao vivo antes
    },
  );

  it("classificação inválida duas vezes (sem falha marcada) + exemplo: gravação com motivo json_invalido", async () => {
    const invalido: ClienteLLM = { modelo: "m", estrito: true, gerarJson: async () => ({ dados: {}, uso: null, finishReason: "stop", ms: 1 }) };
    const handler = criarHandler({ cliente: invalido, limites: limitesZerados(), log: () => {} });
    const json = await (await handler(requisicao(corpoExemplo))).json();
    expect(json.contingencia.motivo).toBe("json_invalido");
    expect(json.nivel).toBe(0);
  });

  it("mensagem digitada à mão com falha do modelo: nível 2 por falha, sem gravação", async () => {
    const handler = criarHandler({ cliente: clienteQueFalha("rate_limit"), limites: limitesZerados(), log: () => {} });
    const json = await (await handler(requisicao({ mensagem: "cadê meu pedido?", contexto: exemplo.contexto }))).json();
    expect(json.contingencia).toBeUndefined();
    expect(json).toMatchObject({ nivel: 2, falha: { tipo: "rate_limit" } });
  });

  it("exceção interna da rota não usa gravação", async () => {
    const handler = criarHandler({
      cliente: clienteProibido,
      limites: limitesZerados(),
      log: () => {},
      processar: async () => {
        throw new Error("interno");
      },
    });
    const json = await (await handler(requisicao(corpoExemplo))).json();
    expect(json.contingencia).toBeUndefined();
    expect(json.falha).toEqual({ tipo: "interno" });
  });

  it("sucesso ao vivo não usa gravação", async () => {
    const vivo: ClienteLLM = {
      modelo: "vivo",
      estrito: true,
      async gerarJson(p) {
        const dados =
          p.nome === "classificacao"
            ? { motivos: ["rastreio"], topico: null, confianca: 0.9, saude: false, ameaca: false }
            : { resposta: "Seu pedido está em trânsito." };
        return { dados, uso: null, finishReason: "stop", ms: 1 };
      },
    };
    const handler = criarHandler({ cliente: vivo, limites: limitesZerados(), log: () => {} });
    const json = await (await handler(requisicao(corpoExemplo))).json();
    expect(json.contingencia).toBeUndefined();
    expect(json.resposta).toBe("Seu pedido está em trânsito.");
  });
});

describe("rota: origem, tamanho e validação valem antes do replay", () => {
  it("origem de outro site com exemplo pronto: 403", async () => {
    const handler = criarHandler({ cliente: clienteProibido, limites: limitesCom("diario"), log: () => {} });
    expect((await handler(requisicao(corpoExemplo, { origin: "https://x.example.com" }))).status).toBe(403);
  });

  it("corpo grande com exemplo pronto: 413", async () => {
    const handler = criarHandler({ cliente: clienteProibido, limites: limitesCom("diario"), log: () => {} });
    expect((await handler(requisicao(corpoExemplo, { "content-length": String(20_000) }))).status).toBe(413);
  });

  it("exemplo com contexto inválido: 400", async () => {
    const handler = criarHandler({ cliente: clienteProibido, limites: limitesCom("diario"), log: () => {} });
    expect((await handler(requisicao({ ...corpoExemplo, contexto: { ...exemplo.contexto, seq: 0 } }))).status).toBe(400);
  });
});

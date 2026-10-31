import { describe, expect, it } from "vitest";
import { NIVEL_BASE } from "../policy";
import { TOPICOS_POLITICA } from "../faq";
import {
  Classificacao,
  CLASSIFICACAO_INVALIDA,
  ESQUEMA_CLASSIFICACAO,
  ESQUEMA_REDACAO,
  MAX_RESPOSTA,
  Redacao,
} from "./esquema";

const valida = { motivos: ["rastreio"], topico: null, confianca: 0.9, saude: false, ameaca: false };

describe("Classificacao (zod)", () => {
  it("aceita saída válida", () => {
    expect(Classificacao.parse(valida)).toEqual(valida);
    expect(Classificacao.parse({ ...valida, topico: "endereco" }).topico).toBe("endereco");
  });

  it("descarta campos extras (o modelo não decide nível nem ação)", () => {
    const r = Classificacao.parse({ ...valida, nivel: 0, acao: "aprovar_reembolso" });
    expect(r).toEqual(valida);
    expect(r).not.toHaveProperty("nivel");
    expect(r).not.toHaveProperty("acao");
  });

  it.each([
    ["motivo fora do enum", { ...valida, motivos: ["aprovar_reembolso"] }],
    ["lista de motivos vazia", { ...valida, motivos: [] }],
    ["mais de 3 motivos", { ...valida, motivos: ["rastreio", "atraso", "avaria", "brinde"] }],
    ["tópico fora do enum", { ...valida, topico: "frete" }],
    ["tópico ausente", { motivos: ["rastreio"], confianca: 0.9, saude: false, ameaca: false }],
    ["confiança acima de 1", { ...valida, confianca: 1.5 }],
    ["confiança negativa", { ...valida, confianca: -0.1 }],
    ["confiança como texto", { ...valida, confianca: "0.9" }],
    ["saúde ausente", { motivos: ["rastreio"], topico: null, confianca: 0.9, ameaca: false }],
  ])("rejeita %s", (_nome, valor) => {
    expect(Classificacao.safeParse(valor).success).toBe(false);
  });

  it("classificação de reserva é válida e é nao_classificado com confiança 0", () => {
    expect(Classificacao.parse(CLASSIFICACAO_INVALIDA)).toEqual({
      motivos: ["nao_classificado"],
      topico: null,
      confianca: 0,
      saude: false,
      ameaca: false,
    });
  });
});

describe("Redacao (zod)", () => {
  it("aceita resposta e remove espaços nas pontas", () => {
    expect(Redacao.parse({ resposta: "  Olá!  " }).resposta).toBe("Olá!");
  });

  it("rejeita resposta vazia ou longa demais", () => {
    expect(Redacao.safeParse({ resposta: "   " }).success).toBe(false);
    expect(Redacao.safeParse({ resposta: "a".repeat(MAX_RESPOSTA + 1) }).success).toBe(false);
  });
});

describe("esquema estrito enviado ao Groq", () => {
  const json = JSON.stringify([ESQUEMA_CLASSIFICACAO, ESQUEMA_REDACAO]);

  it("não tem $schema nem limites sem suporte documentado", () => {
    for (const chave of ["$schema", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"]) {
      expect(json).not.toContain(`"${chave}"`);
    }
  });

  it("objetos fechados e com todas as propriedades obrigatórias", () => {
    expect(ESQUEMA_CLASSIFICACAO.additionalProperties).toBe(false);
    expect(ESQUEMA_CLASSIFICACAO.required).toEqual(["motivos", "topico", "confianca", "saude", "ameaca"]);
    expect(ESQUEMA_REDACAO.additionalProperties).toBe(false);
    expect(ESQUEMA_REDACAO.required).toEqual(["resposta"]);
  });

  it("enums de motivos e tópicos vêm da policy e da FAQ; tópico aceita null", () => {
    const props = ESQUEMA_CLASSIFICACAO.properties as Record<string, unknown>;
    expect(JSON.stringify(props.motivos)).toContain(JSON.stringify(Object.keys(NIVEL_BASE)));
    const topico = JSON.stringify(props.topico);
    expect(topico).toContain(JSON.stringify([...TOPICOS_POLITICA]));
    expect(topico).toContain('"null"');
  });

  it("não menciona nível, autonomia nem ação", () => {
    // palavra inteira: "personalizacao_erro" contém "acao" e é um motivo legítimo
    expect(json).not.toMatch(/\b(nivel|n[ií]vel|autonomia|a[cç][aã]o)\b/i);
  });
});

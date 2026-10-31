import { describe, expect, it } from "vitest";
import { CorpoAgente } from "../rota/handler";
import { EXEMPLOS } from "./exemplos";

describe("exemplos prontos", () => {
  it("são 8, com ids únicos", () => {
    expect(EXEMPLOS).toHaveLength(8);
    expect(new Set(EXEMPLOS.map((e) => e.id)).size).toBe(8);
  });

  it.each(EXEMPLOS.map((e) => [e.id, e] as const))("%s passa na validação da rota", (_id, e) => {
    expect(CorpoAgente.safeParse({ mensagem: e.mensagem, contexto: e.contexto }).success).toBe(true);
  });

  it("nenhum exemplo traz dado pessoal (CPF, telefone, e-mail, cartão)", () => {
    for (const e of EXEMPLOS) {
      expect(e.mensagem).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}|\(\d{2}\)|@|\d{4}[ -]\d{4}/);
    }
  });

  it("valores até R$ 200, para o valor não escalar o nível por conta própria", () => {
    for (const e of EXEMPLOS) expect(e.contexto.valor).toBeLessThanOrEqual(200);
  });
});

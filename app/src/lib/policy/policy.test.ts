import { describe, expect, it } from "vitest";
import {
  decidirNivel,
  LIMIAR_CONFIANCA,
  type EntradaPolitica,
  type Motivo,
  type Nivel,
  type StatusEntrega,
} from "./index";

// Entrada neutra: nenhum escalonador atua.
function entrada(parcial: Partial<EntradaPolitica> = {}): EntradaPolitica {
  return {
    motivos: ["elogio"],
    statusEntrega: "em_transito",
    canal: "whatsapp",
    seq: 1,
    valor: 100,
    saude: false,
    ameaca: false,
    confianca: 0.9,
    faqValidada: new Set(),
    ...parcial,
  };
}

describe("nível-base por motivo", () => {
  const casos: [Motivo, Nivel][] = [
    ["pagamento_pendente", 0],
    ["elogio", 0],
    ["atraso", 1],
    ["avaria", 1],
    ["item_faltando", 1],
    ["brinde", 1],
    ["personalizacao_erro", 1],
    ["cancelamento", 1],
    ["troca_tamanho", 1],
    ["fragrancia", 1],
    ["nao_classificado", 1],
    ["reacao_adversa", 2],
    ["financeiro_cobranca", 2],
  ];
  it.each(casos)("%s → nível %i", (motivo, esperado) => {
    const r = decidirNivel(entrada({ motivos: [motivo] }));
    expect(r.nivel).toBe(esperado);
    expect(r.razoes).toHaveLength(1);
    expect(r.razoes[0]).toContain(motivo);
  });
});

describe("rastreio depende do status", () => {
  const casos: [StatusEntrega, Nivel][] = [
    ["em_transito", 0],
    ["entregue", 1],
    ["atrasado", 1],
    ["em_separacao", 1],
    ["aguardando_pagamento", 1],
  ];
  it.each(casos)("status %s → nível %i", (statusEntrega, esperado) => {
    expect(decidirNivel(entrada({ motivos: ["rastreio"], statusEntrega })).nivel).toBe(esperado);
  });
});

describe("endereço depende do status", () => {
  const casos: [StatusEntrega, Nivel, string][] = [
    ["em_transito", 0, "recusa automática"],
    ["entregue", 0, "recusa automática"],
    ["atrasado", 0, "recusa automática"],
    ["em_separacao", 1, "assistida"],
    ["aguardando_pagamento", 1, "assistida"],
  ];
  it.each(casos)("status %s → nível %i", (statusEntrega, esperado, trecho) => {
    const r = decidirNivel(entrada({ motivos: ["endereco"], statusEntrega }));
    expect(r.nivel).toBe(esperado);
    expect(r.razoes[0]).toContain(trecho);
  });
});

describe("FAQ validada", () => {
  it.each<Motivo>(["duvida_produto", "promo_cupom", "duvida_politica", "direitos_titular"])("%s sem FAQ → 1, com FAQ → 0", (motivo) => {
    expect(decidirNivel(entrada({ motivos: [motivo] })).nivel).toBe(1);
    expect(decidirNivel(entrada({ motivos: [motivo], faqValidada: new Set([motivo]) })).nivel).toBe(0);
  });

  it("FAQ não baixa outros motivos", () => {
    const faqValidada = new Set<Motivo>(["reacao_adversa", "financeiro_cobranca", "atraso"]);
    expect(decidirNivel(entrada({ motivos: ["reacao_adversa"], faqValidada })).nivel).toBe(2);
    expect(decidirNivel(entrada({ motivos: ["financeiro_cobranca"], faqValidada })).nivel).toBe(2);
    expect(decidirNivel(entrada({ motivos: ["atraso"], faqValidada })).nivel).toBe(1);
  });

  it("FAQ de um motivo não vale para o outro", () => {
    const faqValidada = new Set<Motivo>(["promo_cupom"]);
    expect(decidirNivel(entrada({ motivos: ["duvida_produto"], faqValidada })).nivel).toBe(1);
  });
});

describe("vários motivos", () => {
  it("vale o mais restritivo e marca o principal", () => {
    const r = decidirNivel(entrada({ motivos: ["elogio", "reacao_adversa"] }));
    expect(r.nivel).toBe(2);
    expect(r.razoes[0]).toContain("motivo principal");
    expect(r.razoes.at(-1)).toContain("mais restritivo");
  });

  it("ordem dos motivos não muda o nível", () => {
    const a = decidirNivel(entrada({ motivos: ["rastreio", "atraso"] }));
    const b = decidirNivel(entrada({ motivos: ["atraso", "rastreio"] }));
    expect(a.nivel).toBe(1);
    expect(b.nivel).toBe(1);
  });

  it("lista vazia → nível 1", () => {
    const r = decidirNivel(entrada({ motivos: [] }));
    expect(r.nivel).toBe(1);
    expect(r.razoes[0]).toContain("nenhum motivo");
  });

  it("motivo desconhecido → nível 1", () => {
    const r = decidirNivel(entrada({ motivos: ["inexistente" as Motivo] }));
    expect(r.nivel).toBe(1);
    expect(r.razoes[0]).toContain("desconhecido");
  });
});

describe("escalonadores", () => {
  it("canal Reclame Aqui → 2", () => {
    const r = decidirNivel(entrada({ canal: "reclame_aqui" }));
    expect(r.nivel).toBe(2);
    expect(r.razoes).toContain("canal Reclame Aqui: nível 2");
  });

  it("e-mail não escala", () => {
    expect(decidirNivel(entrada({ canal: "email" })).nivel).toBe(0);
  });

  it("seq 2 → pelo menos 1; seq 3 ou mais → 2", () => {
    expect(decidirNivel(entrada({ seq: 2 })).nivel).toBe(1);
    expect(decidirNivel(entrada({ seq: 3 })).nivel).toBe(2);
    expect(decidirNivel(entrada({ seq: 5 })).nivel).toBe(2);
  });

  it("valor acima de 200 → pelo menos 1", () => {
    const r = decidirNivel(entrada({ valor: 250 }));
    expect(r.nivel).toBe(1);
    expect(r.razoes.at(-1)).toContain("R$ 250,00");
  });

  it("valor exatamente 200 não escala", () => {
    expect(decidirNivel(entrada({ valor: 200 })).nivel).toBe(0);
    expect(decidirNivel(entrada({ valor: 200.01 })).nivel).toBe(1);
  });

  it("saúde → 2", () => {
    expect(decidirNivel(entrada({ saude: true })).nivel).toBe(2);
  });

  it("ameaça → 2", () => {
    expect(decidirNivel(entrada({ ameaca: true })).nivel).toBe(2);
  });

  it("saúde vence FAQ validada", () => {
    const r = decidirNivel(
      entrada({ motivos: ["duvida_produto"], faqValidada: new Set(["duvida_produto"]), saude: true }),
    );
    expect(r.nivel).toBe(2);
  });

  it("confiança abaixo do limiar sobe um nível", () => {
    expect(decidirNivel(entrada({ confianca: 0.5 })).nivel).toBe(1);
    expect(decidirNivel(entrada({ motivos: ["atraso"], confianca: 0.5 })).nivel).toBe(2);
  });

  it("confiança exatamente no limiar não escala", () => {
    const r = decidirNivel(entrada({ confianca: LIMIAR_CONFIANCA }));
    expect(r.nivel).toBe(0);
    expect(r.razoes).toHaveLength(1);
  });

  it("confiança baixa com nível já em 2 fica em 2", () => {
    const r = decidirNivel(entrada({ motivos: ["reacao_adversa"], confianca: 0.1 }));
    expect(r.nivel).toBe(2);
    expect(r.razoes.at(-1)).toContain("abaixo do limiar");
  });

  it("escalonador nunca baixa o nível", () => {
    expect(decidirNivel(entrada({ motivos: ["financeiro_cobranca"], seq: 2, valor: 300 })).nivel).toBe(2);
  });
});

describe("casos combinados", () => {
  it("elogio no Reclame Aqui → 2", () => {
    expect(decidirNivel(entrada({ motivos: ["elogio"], canal: "reclame_aqui" })).nivel).toBe(2);
  });

  it("confiança aplicada por último: valor alto + confiança baixa → 2", () => {
    const r = decidirNivel(entrada({ valor: 250, confianca: 0.5 }));
    expect(r.nivel).toBe(2);
    expect(r.razoes).toHaveLength(3);
  });

  it("rastreio em trânsito, 3º contato, valor alto → 2 com uma razão por regra", () => {
    const r = decidirNivel(entrada({ motivos: ["rastreio"], seq: 3, valor: 350 }));
    expect(r.nivel).toBe(2);
    expect(r.razoes).toEqual([
      "rastreio com pedido em trânsito: nível 0 (motivo principal)",
      "3º contato no pedido: nível 2",
      "valor do pedido R$ 350,00 acima de R$ 200,00: pelo menos nível 1",
    ]);
  });

  it("endereço em trânsito com 2º contato → 1", () => {
    expect(decidirNivel(entrada({ motivos: ["endereco"], seq: 2 })).nivel).toBe(1);
  });

  it("duas perguntas informativas sem escalonador → 0", () => {
    const faqValidada = new Set<Motivo>(["duvida_politica", "direitos_titular"]);
    expect(decidirNivel(entrada({ motivos: ["duvida_politica", "direitos_titular"], faqValidada })).nivel).toBe(0);
  });

  it("duas perguntas informativas, FAQ só de uma → 1", () => {
    const faqValidada = new Set<Motivo>(["direitos_titular"]);
    expect(decidirNivel(entrada({ motivos: ["duvida_politica", "direitos_titular"], faqValidada })).nivel).toBe(1);
  });
});

describe("entrada inválida lança RangeError", () => {
  it.each([
    ["confiança negativa", { confianca: -0.1 }],
    ["confiança acima de 1", { confianca: 1.1 }],
    ["confiança NaN", { confianca: NaN }],
    ["seq zero", { seq: 0 }],
    ["seq fracionário", { seq: 1.5 }],
    ["valor negativo", { valor: -1 }],
    ["valor infinito", { valor: Infinity }],
  ])("%s", (_, parcial) => {
    expect(() => decidirNivel(entrada(parcial))).toThrow(RangeError);
  });

  it("aceita confiança nas pontas 0 e 1", () => {
    expect(decidirNivel(entrada({ confianca: 0 })).nivel).toBe(1);
    expect(decidirNivel(entrada({ confianca: 1 })).nivel).toBe(0);
  });
});

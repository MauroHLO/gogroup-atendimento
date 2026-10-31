import { describe, expect, it } from "vitest";
import { decidirNivel, NIVEL_BASE, type EntradaPolitica, type Motivo } from "../policy";
import {
  buscarFaq,
  contemCompromisso,
  FAQ,
  FAQ_POLITICA,
  FAQ_PRODUTO,
  faqParaConsulta,
  faqValidada,
  guiaInterno,
  TOPICOS_POLITICA,
  type EntradaFaq,
} from "./index";

const MOTIVOS = Object.keys(NIVEL_BASE) as Motivo[];

function entradaPolitica(parcial: Partial<EntradaPolitica>): EntradaPolitica {
  return {
    motivos: ["duvida_politica"],
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

describe("conteúdo da FAQ", () => {
  it.each(FAQ.map((e) => [e.id, e] as const))("%s não contém valores em R$", (_id, e) => {
    expect(e.texto).not.toContain("R$");
  });

  it("nenhuma entrada de uso cliente contém verbos de compromisso", () => {
    for (const e of FAQ.filter((x) => x.uso === "cliente")) {
      expect(contemCompromisso(e.texto), e.id).toBe(false);
    }
  });

  it.each([
    "Garantimos a entrega amanhã.",
    "Vamos reembolsar o valor.",
    "Já reenviamos o seu pedido.",
    "Ja reenviamos o item.",
    "O valor será reembolsado.",
    "O item será reenviado amanhã.",
    "A peça será reenviada hoje.",
  ])("padrões de compromisso detectam: %s", (frase) => {
    expect(contemCompromisso(frase)).toBe(true);
  });

  it("explicar a política não conta como compromisso", () => {
    expect(contemCompromisso("O reenvio é sem custo para você, mediante foto, sujeito à análise da equipe.")).toBe(false);
    expect(contemCompromisso("A solicitação é analisada antes de qualquer devolução.")).toBe(false);
  });

  it("toda entrada validada tem fonte", () => {
    for (const e of FAQ.filter((x) => x.validada)) {
      expect(e.fonte, e.id).toBeTruthy();
    }
  });

  it("ids são únicos e motivos existem na policy", () => {
    expect(new Set(FAQ.map((e) => e.id)).size).toBe(FAQ.length);
    for (const e of FAQ) {
      expect(e.motivos.length, e.id).toBeGreaterThan(0);
      for (const m of e.motivos) expect(MOTIVOS, e.id).toContain(m);
    }
  });

  it.each([...TOPICOS_POLITICA])("tópico de política %s tem entrada", (topico) => {
    expect(FAQ_POLITICA.some((e) => e.topico === topico && e.validada)).toBe(true);
  });

  it("toda entrada de política usa um tópico conhecido", () => {
    for (const e of FAQ_POLITICA) expect(TOPICOS_POLITICA as readonly string[]).toContain(e.topico);
  });

  it("reação adversa e cobrança só têm entradas de uso interno", () => {
    for (const e of FAQ.filter((x) => x.uso === "cliente")) {
      expect(e.motivos).not.toContain("reacao_adversa");
      expect(e.motivos).not.toContain("financeiro_cobranca");
    }
  });

  it("direitos do titular citam a Central de Privacidade e o prazo de 15 dias", () => {
    const [e] = buscarFaq({ motivo: "direitos_titular", saude: false });
    expect(e.fonte).toContain("https://privacidade.devgogroup.com");
    expect(e.texto).toContain("15 dias");
    expect(e.texto).not.toContain("Aviso de Privacidade");
  });

  it("camada de produto e promoções está vazia e pendente", () => {
    expect(FAQ_PRODUTO.status).toBe("pendente");
    expect(FAQ_PRODUTO.entradas).toHaveLength(0);
  });
});

describe("faqValidada", () => {
  it("exclui duvida_produto e promo_cupom", () => {
    const s = faqValidada();
    expect(s.has("duvida_produto")).toBe(false);
    expect(s.has("promo_cupom")).toBe(false);
  });

  it("inclui duvida_politica e direitos_titular, e não inclui motivos só internos", () => {
    const s = faqValidada();
    expect(s.has("duvida_politica")).toBe(true);
    expect(s.has("direitos_titular")).toBe(true);
    expect(s.has("reacao_adversa")).toBe(false);
    expect(s.has("financeiro_cobranca")).toBe(false);
  });

  it("entrada de produto validada (injetada) passa a contar; não validada, não", () => {
    const produto: EntradaFaq = {
      id: "prod-ficticio",
      camada: "produto_promocoes",
      motivos: ["duvida_produto"],
      topico: "produto_ficticio",
      texto: "Entrada fictícia de teste.",
      fonte: "teste",
      validada: true,
      uso: "cliente",
    };
    expect(faqValidada([produto]).has("duvida_produto")).toBe(true);
    expect(faqValidada([{ ...produto, validada: false }]).has("duvida_produto")).toBe(false);
  });
});

describe("buscarFaq", () => {
  it("assunto de saúde devolve vazio para qualquer motivo e tópico", () => {
    for (const motivo of MOTIVOS) {
      expect(buscarFaq({ motivo, saude: true })).toEqual([]);
      for (const topico of TOPICOS_POLITICA) expect(buscarFaq({ motivo, topico, saude: true })).toEqual([]);
    }
  });

  it("busca por motivo e tópico", () => {
    const r = buscarFaq({ motivo: "duvida_politica", topico: "endereco", saude: false });
    expect(r.map((e) => e.id)).toEqual(["pol-endereco"]);
  });

  it("nunca devolve entradas internas", () => {
    for (const motivo of MOTIVOS) {
      for (const e of buscarFaq({ motivo, saude: false })) expect(e.uso).toBe("cliente");
    }
    expect(buscarFaq({ motivo: "reacao_adversa", topico: "reacao_adversa", saude: false })).toEqual([]);
  });

  it("sem tópico, responde só quando o motivo tem um único tópico", () => {
    expect(buscarFaq({ motivo: "cancelamento", saude: false }).map((e) => e.id)).toEqual(["pol-arrependimento"]);
    expect(buscarFaq({ motivo: "duvida_politica", saude: false })).toEqual([]);
  });

  it("duvida_politica nunca é respondida sem tópico, mesmo havendo entradas de política", () => {
    const comDuvidaPolitica = FAQ.filter((e) => e.uso === "cliente" && e.validada && e.motivos.includes("duvida_politica"));
    expect(comDuvidaPolitica.length).toBeGreaterThan(1);
    expect(buscarFaq({ motivo: "duvida_politica", saude: false })).toEqual([]);
    expect(faqParaConsulta({ saude: false }).has("duvida_politica")).toBe(false);
  });

  it("tópico sem entrada devolve vazio", () => {
    expect(buscarFaq({ motivo: "duvida_politica", topico: "frete", saude: false })).toEqual([]);
  });

  it("é determinística (mesma consulta, mesma ordem, ordem por id)", () => {
    const embaralhada = [...FAQ].reverse();
    const a = buscarFaq({ motivo: "avaria", saude: false });
    const b = buscarFaq({ motivo: "avaria", saude: false }, embaralhada);
    expect(a).toEqual(b);
  });
});

describe("guiaInterno", () => {
  it("devolve o guia de reação adversa e de cobrança", () => {
    const reacao = guiaInterno("reacao_adversa");
    expect(reacao.map((e) => e.id)).toEqual(["int-reacao-adversa"]);
    expect(reacao[0].texto).toContain("24 horas");
    expect(reacao[0].texto).toContain("não substitui");
    expect(guiaInterno("financeiro_cobranca").map((e) => e.id)).toEqual(["int-cobranca-duplicada"]);
  });

  it("não devolve entradas de cliente", () => {
    expect(guiaInterno("endereco")).toEqual([]);
  });
});

describe("faqParaConsulta + decidirNivel", () => {
  it("duvida_politica vai a nível 0 só se a busca por tópico achar entrada", () => {
    const comTopico = faqParaConsulta({ topico: "troca_fragrancia", saude: false });
    expect(decidirNivel(entradaPolitica({ faqValidada: comTopico })).nivel).toBe(0);
  });

  it("pergunta de política sem tópico correspondente fica em nível 1", () => {
    for (const consulta of [{ topico: "frete", saude: false }, { saude: false }]) {
      const faq = faqParaConsulta(consulta);
      expect(faq.has("duvida_politica")).toBe(false);
      expect(decidirNivel(entradaPolitica({ faqValidada: faq })).nivel).toBe(1);
    }
  });

  it("direitos do titular vão a nível 0 com a entrada da Central de Privacidade", () => {
    const faq = faqParaConsulta({ saude: false });
    expect(decidirNivel(entradaPolitica({ motivos: ["direitos_titular"], faqValidada: faq })).nivel).toBe(0);
  });

  it("saúde zera o conjunto", () => {
    expect(faqParaConsulta({ topico: "endereco", saude: true }).size).toBe(0);
  });

  it("produto e cupom continuam fora", () => {
    for (const topico of [undefined, ...TOPICOS_POLITICA]) {
      const faq = faqParaConsulta({ topico, saude: false });
      expect(faq.has("duvida_produto")).toBe(false);
      expect(faq.has("promo_cupom")).toBe(false);
    }
  });
});

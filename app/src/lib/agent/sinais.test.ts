import { describe, expect, it } from "vitest";
import { detectarSinais, normalizar } from "./sinais";

describe("normalizar", () => {
  it("remove acentos e passa para minúsculas", () => {
    expect(normalizar("Grávida, BEBÊ, Justiça, Reclamação")).toBe("gravida, bebe, justica, reclamacao");
  });
});

describe("saúde", () => {
  it.each([
    "Estou grávida, posso usar?",
    "estou gravida e quero saber",
    "Durante a gravidez pode?",
    "sou gestante",
    "estou amamentando",
    "é para o meu bebê",
    "uso no bebe",
    "presente para os bebês",
    "minha filha usou",
    "meu  filho passou",
    "tenho alergia a perfume",
    "fiquei alérgica",
    "o rosto ficou inchado",
    "deu coceira",
    "tive uma queimadura",
    "queimou minha pele",
    "queimei o rosto",
    "está queimando",
    "apareceram bolinhas",
    "qual é a fórmula?",
    "as formulas mudaram?",
  ])("detecta: %s", (texto) => {
    expect(detectarSinais(texto).saude).toBe(true);
  });

  it.each([
    "quando chega meu pedido?",
    "vi a queima de estoque no site",
    "a promoção é uma queima total",
    "ele bebeu água",
    "preenchi o formulário",
    "minha capinha veio errada",
  ])("não detecta: %s", (texto) => {
    expect(detectarSinais(texto).saude).toBe(false);
  });
});

describe("ameaça", () => {
  it.each([
    "vou no Procon",
    "vou chamar meu advogado",
    "minha advogada vai ver isso",
    "vou abrir um processo  judicial",
    "vou na Justiça",
    "vou na justica",
    "vou abrir reclamação",
    "vou abrir reclamacao",
    "vou postar no Reclame Aqui",
    "RECLAME AQUI",
  ])("detecta: %s", (texto) => {
    expect(detectarSinais(texto).ameaca).toBe(true);
  });

  it.each(["quero trocar o tamanho", "obrigada pelo atendimento", "abri o pacote"])("não detecta: %s", (texto) => {
    expect(detectarSinais(texto).ameaca).toBe(false);
  });
});

it("saúde e ameaça são independentes", () => {
  expect(detectarSinais("estou grávida e vou no Procon")).toEqual({ saude: true, ameaca: true });
  expect(detectarSinais("cadê meu pedido?")).toEqual({ saude: false, ameaca: false });
});

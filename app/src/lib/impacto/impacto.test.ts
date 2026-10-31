import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGREGADOS,
  DERIVADOS,
  INTRODUCAO_PAINEL,
  PAINEL,
  descreverFonte,
  fmtDec,
  fmtInt,
  fmtPct,
  fmtPct1,
  fmtRs,
  type Arquivo,
  type ChaveAgregado,
} from ".";

// Agregados versionados na raiz do repositório (data/processed). Num clone só de app/, os testes de
// conferência com os arquivos são pulados; os demais continuam valendo.
const PASTA = fileURLToPath(new URL("../../../../data/processed/", import.meta.url));
const existe = existsSync(`${PASTA}metricas.json`);

function lerJson(): unknown {
  return JSON.parse(readFileSync(`${PASTA}metricas.json`, "utf-8"));
}

function lerCsv(arquivo: Arquivo): Map<string, Record<string, string>> {
  const linhas = readFileSync(`${PASTA}${arquivo}`, "utf-8").trim().split(/\r?\n/);
  const cabecalho = linhas[0].split(",");
  const mapa = new Map<string, Record<string, string>>();
  for (const linha of linhas.slice(1)) {
    const campos = linha.split(",");
    const registro: Record<string, string> = {};
    cabecalho.forEach((c, i) => (registro[c] = campos[i]));
    mapa.set(campos[0], registro);
  }
  return mapa;
}

function valorNoArquivo(arquivo: Arquivo, chave: string): unknown {
  if (arquivo === "metricas.json") {
    return chave.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], lerJson());
  }
  const ponto = chave.lastIndexOf(".");
  const linha = lerCsv(arquivo).get(chave.slice(0, ponto));
  const bruto = linha?.[chave.slice(ponto + 1)];
  return bruto === undefined ? undefined : Number(bruto);
}

const chaves = Object.keys(AGREGADOS) as ChaveAgregado[];

describe("agregados copiados conferem com data/processed", () => {
  it.skipIf(!existe).each(chaves)("%s", (k) => {
    const a = AGREGADOS[k];
    expect(valorNoArquivo(a.arquivo, a.chave)).toBe(a.valor);
  });
});

describe("consistência entre os agregados", () => {
  const v = (k: ChaveAgregado) => AGREGADOS[k].valor;

  it("a simulação de autonomia soma as conversas com mensagem do cliente", () => {
    expect(v("nivel0Conversas") + v("nivel1Conversas") + v("nivel2Conversas")).toBe(v("conversasComMensagem"));
  });

  it("os percentuais da simulação somam 100% (com arredondamento)", () => {
    expect(v("nivel0PctConversas") + v("nivel1PctConversas") + v("nivel2PctConversas")).toBeCloseTo(100, 0);
    expect(v("nivel0PctCusto") + v("nivel1PctCusto") + v("nivel2PctCusto")).toBeCloseTo(100, 0);
  });

  it("os grupos evitáveis cobrem a amostra inteira", () => {
    expect(v("falhaProcesso") + v("comunicacaoProativa") + v("exigePessoa") + v("semAcao")).toBe(v("conversasAmostra"));
  });

  it("o custo por canal soma o custo estimado da população", () => {
    expect(Math.round(v("custoEmail") + v("custoReclameAqui") + v("custoWhatsapp"))).toBe(v("custoEstimado"));
  });

  it("as conversas estimadas são a amostra × 3", () => {
    expect(v("conversasEstimadas")).toBe(v("conversasAmostra") * 3);
  });
});

describe("derivados", () => {
  it("calcula os números derivados", () => {
    expect(DERIVADOS.atrasoRastreioPctCusto).toBe(36.8);
    expect(DERIVADOS.falhaProcessoPct).toBe(36.1);
    expect(DERIVADOS.comunicacaoProativaPct).toBe(37.4);
    expect(DERIVADOS.concordanciaPct).toBe(71.3);
    expect(DERIVADOS.divergenciaTetoPct).toBe(28.7);
    expect(DERIVADOS.reacaoConcordanciaPct).toBe(20);
    expect(DERIVADOS.rotaExpressLogisticaPct).toBe(62.8);
    expect(DERIVADOS.rotaExpressReferenciaPct).toBe(20.4);
    expect(DERIVADOS.proximaRaComAmeacaPct).toBe(50);
    expect(DERIVADOS.proximaRaSemAmeacaPct).toBe(10.8);
  });
});

describe("formatação pt-BR", () => {
  it.each([
    [fmtInt(12000), "12.000"],
    [fmtInt(108299), "108.299"],
    [fmtInt(513), "513"],
    [fmtDec(14.5), "14,5"],
    [fmtDec(72), "72"],
    [fmtDec(3.08), "3,08"],
    [fmtPct(60.1), "60,1%"],
    [fmtPct1(57), "57,0%"],
    [fmtPct1(14.5), "14,5%"],
    [fmtRs(28343), "R$ 28.343"],
  ])("%s", (obtido, esperado) => {
    expect(obtido).toBe(esperado);
  });
});

describe("textos do painel", () => {
  const todosTextos = [
    INTRODUCAO_PAINEL,
    ...PAINEL.flatMap((b) => [
      b.titulo,
      b.introducao ?? "",
      b.aviso ?? "",
      b.conclusao ?? "",
      ...b.destaques.flatMap((x) => [x.valor, x.texto]),
      ...b.linhas.map((l) => l.texto),
      ...(b.limites ?? []),
    ]),
  ].join("\n");

  it("tem os 5 blocos na ordem do plano", () => {
    expect(PAINEL.map((b) => b.id)).toEqual(["problema", "evitaveis", "autonomia", "defesa", "limites"]);
  });

  it("nunca apresenta contato evitado como medido", () => {
    const semNegacao = todosTextos.replace(/nada aqui é contato evitado medido/g, "");
    expect(semNegacao).not.toMatch(/contatos? evitados?/i);
    expect(todosTextos).toContain("potencialmente evitáveis (hipótese)");
  });

  it("a simulação traz o aviso do classificador por regras e a leitura do custo por nível", () => {
    const bloco = PAINEL.find((b) => b.id === "autonomia")!;
    expect(bloco.aviso).toContain("classificador por regras do script Python");
    expect(bloco.aviso).toContain("não o LLM");
    expect(bloco.conclusao).toBe(
      "O nível 0 cobre 14,5% das conversas, mas só 8,1% do custo. O valor está em preparar o nível 1 (31,7% do custo) e priorizar o nível 2 (60,1% do custo, com humano).",
    );
  });

  it("Rota Express e o custo dos recontatos aparecem como associação, não causa", () => {
    const destaques = PAINEL.flatMap((b) => [...b.destaques, ...b.linhas]);
    const rota = destaques.find((x) => x.texto.includes("Rota Express"))!;
    const recontato = destaques.find((x) => x.texto.includes("Os recontatos somam"))!;
    expect(rota.rotulos).toContain("associacao");
    expect(recontato.rotulos).toContain("associacao");
  });

  it("todo destaque e toda linha têm fonte e rótulo", () => {
    for (const b of PAINEL) {
      for (const x of [...b.destaques, ...b.linhas]) {
        expect(x.fontes.length).toBeGreaterThan(0);
        expect(x.rotulos.length).toBeGreaterThan(0);
      }
    }
  });

  it("valores em R$ são sempre rotulados como estimados", () => {
    for (const b of PAINEL) {
      for (const x of [...b.destaques, ...b.linhas]) {
        const valor = "valor" in x ? x.valor : "";
        if (`${valor} ${x.texto}`.includes("R$")) expect(x.rotulos).toContain("estimado");
      }
    }
  });

  it("descreve a fonte com arquivo e chave", () => {
    expect(descreverFonte("custoEstimado")).toBe("metricas.json → resumo.custo_estimado_populacao_rs");
    expect(descreverFonte("nivel2PctCusto")).toBe("autonomia.csv → 2.pct_custo");
  });
});

import { describe, expect, it } from "vitest";
import { NIVEL_BASE, type Motivo, type Nivel, type StatusEntrega } from "../policy";
import { acaoSugerida, AUTONOMIA_POR_NIVEL, type Autonomia } from "./index";

const MOTIVOS = Object.keys(NIVEL_BASE) as Motivo[];
const STATUS: StatusEntrega[] = ["em_separacao", "em_transito", "entregue", "atrasado", "aguardando_pagamento"];
const NIVEIS: Nivel[] = [0, 1, 2];
const FAQ_COMPLETA = new Set<Motivo>(MOTIVOS);
const ORDEM: Record<Autonomia, Nivel> = { executa: 0, prepara_e_aguarda_aprovacao: 1, escala_para_humano: 2 };

describe("varredura completa (motivo × status × nível, com e sem FAQ)", () => {
  it("cobre os 19 motivos do tipo", () => {
    expect(MOTIVOS).toHaveLength(19);
  });

  for (const faq of [new Set<Motivo>(), FAQ_COMPLETA]) {
    for (const motivo of MOTIVOS) {
      for (const status of STATUS) {
        for (const nivel of NIVEIS) {
          it(`${motivo} / ${status} / nível ${nivel} / FAQ ${faq.size ? "completa" : "vazia"}`, () => {
            const r = acaoSugerida(motivo, nivel, status, faq);
            expect(r.acao).toBeTruthy();
            expect(r.descricao.length).toBeGreaterThan(10);
            // nunca menos restritiva que o nível recebido
            expect(ORDEM[r.autonomia]).toBeGreaterThanOrEqual(nivel);
            // ajuste presente se e somente se a trava elevou
            expect(r.ajuste !== undefined).toBe(ORDEM[r.autonomia] > nivel);
            if (motivo === "reacao_adversa") {
              expect(r.autonomia).toBe("escala_para_humano");
              expect(r.acao).toBe("encaminhar_responsavel_tecnica");
            }
            if (motivo === "financeiro_cobranca") {
              expect(r.acao).toBe("encaminhar_financeiro");
            }
          });
        }
      }
    }
  }
});

describe("nível recebido sem trava define a autonomia", () => {
  it.each(NIVEIS)("nível %i", (nivel) => {
    const r = acaoSugerida("elogio", nivel, "em_transito");
    expect(r.autonomia).toBe(AUTONOMIA_POR_NIVEL[nivel]);
    expect(r.ajuste).toBeUndefined();
  });
});

describe("nível 0: executa", () => {
  const casos: [Motivo, StatusEntrega, string][] = [
    ["rastreio", "em_transito", "informar_status_pedido"],
    ["endereco", "em_transito", "recusar_alteracao_endereco"],
    ["endereco", "entregue", "recusar_alteracao_endereco"],
    ["endereco", "atrasado", "recusar_alteracao_endereco"],
    ["pagamento_pendente", "aguardando_pagamento", "informar_status_pagamento"],
    ["elogio", "entregue", "registrar_elogio"],
    ["duvida_politica", "entregue", "responder_com_politica"],
    ["direitos_titular", "entregue", "informar_central_privacidade"],
  ];
  const faq = new Set<Motivo>(["duvida_politica", "direitos_titular"]);
  it.each(casos)("%s / %s → %s", (motivo, status, acao) => {
    const r = acaoSugerida(motivo, 0, status, faq);
    expect(r).toMatchObject({ acao, autonomia: "executa" });
    expect(r.ajuste).toBeUndefined();
  });

  it("direitos do titular cita a Central de Privacidade e o prazo de 15 dias", () => {
    const r = acaoSugerida("direitos_titular", 0, "entregue", faq);
    expect(r.descricao).toContain("Central de Privacidade");
    expect(r.descricao).toContain("15 dias");
  });

  it("dúvidas de produto, cupom, política e direitos do titular executam só com FAQ validada", () => {
    for (const motivo of ["duvida_produto", "promo_cupom", "duvida_politica", "direitos_titular"] as Motivo[]) {
      expect(acaoSugerida(motivo, 0, "entregue", new Set([motivo]))).toMatchObject({
        autonomia: "executa",
      });
      const semFaq = acaoSugerida(motivo, 0, "entregue");
      expect(semFaq).toMatchObject({ acao: "preparar_rascunho_resposta", autonomia: "prepara_e_aguarda_aprovacao" });
      expect(semFaq.ajuste).toContain("sem entrada validada na FAQ");
    }
  });
});

describe("nível 1: prepara e aguarda aprovação", () => {
  const casos: [Motivo, StatusEntrega, string][] = [
    ["rastreio", "em_transito", "preparar_resposta_situacao_pedido"],
    ["rastreio", "atrasado", "abrir_chamado_transportadora"],
    ["rastreio", "entregue", "verificar_entrega_transportadora"],
    ["rastreio", "aguardando_pagamento", "preparar_orientacao_pagamento"],
    ["rastreio", "em_separacao", "preparar_resposta_situacao_pedido"],
    ["atraso", "em_transito", "abrir_chamado_transportadora"],
    ["atraso", "atrasado", "abrir_chamado_transportadora"],
    ["atraso", "entregue", "verificar_entrega_transportadora"],
    ["atraso", "em_separacao", "preparar_resposta_situacao_pedido"],
    ["atraso", "aguardando_pagamento", "preparar_orientacao_pagamento"],
    ["endereco", "em_separacao", "preparar_alteracao_endereco"],
    ["endereco", "aguardando_pagamento", "preparar_alteracao_endereco"],
    ["endereco", "em_transito", "preparar_recusa_alteracao_endereco"],
    ["endereco", "entregue", "preparar_recusa_alteracao_endereco"],
    ["endereco", "atrasado", "preparar_recusa_alteracao_endereco"],
    ["item_faltando", "entregue", "preparar_reenvio"],
    ["brinde", "entregue", "preparar_reenvio"],
    ["avaria", "entregue", "solicitar_fotos_e_preparar_reposicao"],
    ["personalizacao_erro", "entregue", "solicitar_fotos_e_preparar_reposicao"],
    ["troca_tamanho", "entregue", "preparar_troca"],
    ["fragrancia", "entregue", "preparar_troca"],
    ["cancelamento", "em_separacao", "preparar_cancelamento"],
    ["cancelamento", "aguardando_pagamento", "preparar_cancelamento"],
    ["cancelamento", "em_transito", "preparar_devolucao"],
    ["cancelamento", "entregue", "preparar_devolucao"],
    ["nao_classificado", "entregue", "preparar_triagem"],
    ["duvida_politica", "entregue", "preparar_rascunho_resposta"],
  ];
  it.each(casos)("%s / %s → %s", (motivo, status, acao) => {
    expect(acaoSugerida(motivo, 1, status)).toMatchObject({ acao, autonomia: "prepara_e_aguarda_aprovacao" });
  });

  it("motivo que pressupõe entrega, com status de não entregue, vai para triagem", () => {
    for (const motivo of ["item_faltando", "brinde", "avaria", "personalizacao_erro", "troca_tamanho", "fragrancia"] as Motivo[]) {
      const r = acaoSugerida(motivo, 1, "em_transito");
      expect(r.acao).toBe("preparar_triagem");
      expect(r.descricao).toContain("em_transito");
    }
  });
});

describe("nível 2: escala para humano", () => {
  it("rastreio em trânsito com nível 2 (ex.: Reclame Aqui) escala sem ajuste", () => {
    const r = acaoSugerida("rastreio", 2, "em_transito");
    expect(r).toMatchObject({ acao: "escalar_atendimento_humano", autonomia: "escala_para_humano" });
    expect(r.ajuste).toBeUndefined();
  });

  it("endereço já enviado com nível 2 escala com sugestão de recusa", () => {
    expect(acaoSugerida("endereco", 2, "entregue").descricao).toContain("recusa");
    expect(acaoSugerida("endereco", 2, "em_separacao").descricao).not.toContain("recusa");
  });

  it("reação adversa vai à responsável técnica em até 24 horas", () => {
    const r = acaoSugerida("reacao_adversa", 2, "entregue");
    expect(r.acao).toBe("encaminhar_responsavel_tecnica");
    expect(r.descricao).toContain("24 horas");
    expect(r.descricao).toContain("lote");
  });

  it("cobrança vai ao financeiro sem confirmar estorno", () => {
    const r = acaoSugerida("financeiro_cobranca", 2, "entregue");
    expect(r.acao).toBe("encaminhar_financeiro");
    expect(r.descricao).toContain("nenhum estorno é confirmado");
  });

  it("nenhuma descrição de nível 2 fala em resposta ao cliente (no nível 2 não há resposta)", () => {
    for (const motivo of Object.keys(NIVEL_BASE) as Motivo[]) {
      for (const status of STATUS) {
        const d = acaoSugerida(motivo, 2, status).descricao;
        expect(d, `${motivo}/${status}`).not.toMatch(/\bresposta\b|\bresponder\b|\brascunho\b/i);
      }
    }
  });
});

describe("trava: nível mínimo do motivo dado o status", () => {
  it("reação adversa com nível 0 sobe para escala, com ajuste", () => {
    const r = acaoSugerida("reacao_adversa", 0, "entregue");
    expect(r.autonomia).toBe("escala_para_humano");
    expect(r.ajuste).toContain("do nível 0 para o 2");
    expect(r.ajuste).toContain("reacao_adversa");
  });

  it("cobrança com nível 1 sobe para escala", () => {
    const r = acaoSugerida("financeiro_cobranca", 1, "entregue");
    expect(r.autonomia).toBe("escala_para_humano");
    expect(r.ajuste).toContain("do nível 1 para o 2");
  });

  it("atraso com nível 0 sobe para prepara", () => {
    const r = acaoSugerida("atraso", 0, "atrasado");
    expect(r).toMatchObject({ acao: "abrir_chamado_transportadora", autonomia: "prepara_e_aguarda_aprovacao" });
    expect(r.ajuste).toContain("do nível 0 para o 1");
  });

  it("rastreio fora de em_transito com nível 0 sobe para prepara", () => {
    const r = acaoSugerida("rastreio", 0, "entregue");
    expect(r).toMatchObject({ acao: "verificar_entrega_transportadora", autonomia: "prepara_e_aguarda_aprovacao" });
    expect(r.ajuste).toContain('status "entregue"');
  });

  it("endereço em separação com nível 0 sobe para alteração assistida", () => {
    const r = acaoSugerida("endereco", 0, "em_separacao");
    expect(r).toMatchObject({ acao: "preparar_alteracao_endereco", autonomia: "prepara_e_aguarda_aprovacao" });
    expect(r.ajuste).toBeDefined();
  });
});

describe("entradas fora do tipo", () => {
  it("nível inválido lança RangeError", () => {
    expect(() => acaoSugerida("elogio", 3 as Nivel, "entregue")).toThrow(RangeError);
    expect(() => acaoSugerida("elogio", -1 as Nivel, "entregue")).toThrow(RangeError);
    expect(() => acaoSugerida("elogio", Number.NaN as Nivel, "entregue")).toThrow(RangeError);
  });

  it("motivo desconhecido vai para triagem (nível 1) ou escala (nível 2)", () => {
    const desconhecido = "inventado" as Motivo;
    const r0 = acaoSugerida(desconhecido, 0, "entregue");
    expect(r0).toMatchObject({ acao: "preparar_triagem", autonomia: "prepara_e_aguarda_aprovacao" });
    expect(r0.ajuste).toContain("motivo desconhecido");
    expect(acaoSugerida(desconhecido, 2, "entregue").autonomia).toBe("escala_para_humano");
  });
});

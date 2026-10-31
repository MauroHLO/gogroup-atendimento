import { describe, expect, it } from "vitest";
import { buscarFaq } from "../faq";
import { MAX_RESPOSTA } from "./esquema";
import { TEXTO_RESERVA, verificarResposta, type Permitido } from "./checagem";

const faqEndereco = buscarFaq({ motivo: "endereco", saude: false });
const faqTitular = buscarFaq({ motivo: "direitos_titular", saude: false });
const faqAvaria = buscarFaq({ motivo: "avaria", saude: false });

function permitido(parcial: Partial<Permitido> = {}): Permitido {
  return { textosFaq: faqAvaria.map((e) => e.texto), fatos: [], links: [], ...parcial };
}

describe("textos que passam", () => {
  it("texto de reserva passa em todas as checagens", () => {
    expect(verificarResposta(TEXTO_RESERVA, permitido({ textosFaq: [] }))).toEqual({ ok: true, falhas: [] });
  });

  it("prazo que está na FAQ usada", () => {
    const r = verificarResposta(
      "Sinto muito pelo ocorrido! Avise-nos em até 7 dias depois do recebimento e mande uma foto; a equipe vai analisar.",
      permitido(),
    );
    expect(r).toEqual({ ok: true, falhas: [] });
  });

  it("fato do contexto (valor do pedido)", () => {
    const r = verificarResposta("O seu pedido de 150,00 está em trânsito.", permitido({ textosFaq: [], fatos: ["150,00"] }));
    expect(r.ok).toBe(true);
  });

  it("link da Central de Privacidade quando a entrada foi usada, inclusive com pontuação no fim", () => {
    const r = verificarResposta(
      "Use a Central de Privacidade em https://privacidade.devgogroup.com. A Central responde em até 15 dias.",
      { textosFaq: faqTitular.map((e) => e.texto), fatos: [], links: ["https://privacidade.devgogroup.com"] },
    );
    expect(r).toEqual({ ok: true, falhas: [] });
  });

  it("explicar a política sem prometer", () => {
    const r = verificarResposta(
      "O reenvio é sem custo para você, mediante foto, sujeito à análise da equipe.",
      permitido(),
    );
    expect(r.ok).toBe(true);
  });
});

describe("textos que falham", () => {
  it.each([
    ["prazo inventado", "Você recebe em 3 dias úteis.", "numero_sem_fonte"],
    ["prazo de outra entrada da FAQ", "A troca pode ser pedida em até 30 dias.", "numero_sem_fonte"],
    ["valor inventado", "Seu reembolso de 99,90 está garantido.", "numero_sem_fonte"],
    ["número por extenso", "O prazo é de sete dias.", "numero_por_extenso"],
    ["número por extenso com acento", "Em três dias chega.", "numero_por_extenso"],
    ["compromisso: vamos reembolsar", "Fique tranquila, vamos reembolsar você.", "compromisso"],
    ["compromisso: já reenviamos", "Já reenviamos o seu pedido.", "compromisso"],
    ["compromisso: será reembolsado", "O valor será reembolsado.", "compromisso"],
    ["compromisso: garantimos", "Garantimos a entrega.", "compromisso"],
    ["pede CPF", "Pode me passar o seu CPF?", "dado_sensivel"],
    ["pede cartão", "Informe os dados do cartão.", "dado_sensivel"],
    ["pede cartão sem acento", "informe o numero do cartao", "dado_sensivel"],
    ["pede senha", "Qual é a sua senha?", "dado_sensivel"],
    ["pede CVV", "Envie o CVV.", "dado_sensivel"],
    ["pede código de segurança", "Envie o código de segurança.", "dado_sensivel"],
    ["link sem fonte", "Acesse https://golpe.example.com para resolver.", "link_sem_fonte"],
    ["link www sem fonte", "Veja www.example.com", "link_sem_fonte"],
    ["texto vazio", "   ", "formato"],
  ])("%s", (_nome, texto, falha) => {
    const r = verificarResposta(texto, permitido());
    expect(r.ok).toBe(false);
    expect(r.falhas).toContain(falha);
  });

  it("link da Central sem a entrada correspondente ter sido usada", () => {
    const r = verificarResposta("Veja https://privacidade.devgogroup.com", permitido());
    expect(r.falhas).toContain("link_sem_fonte");
  });

  it("número de outra entrada da FAQ não vale se ela não foi usada", () => {
    const r = verificarResposta("Avise-nos em até 7 dias.", permitido({ textosFaq: faqEndereco.map((e) => e.texto) }));
    expect(r.falhas).toContain("numero_sem_fonte");
  });

  it("texto longo demais", () => {
    expect(verificarResposta("a".repeat(MAX_RESPOSTA + 1), permitido()).falhas).toContain("formato");
  });

  it("acumula várias falhas", () => {
    const r = verificarResposta("Garantimos o estorno em 2 dias, só mandar o CPF.", permitido());
    expect(r.falhas).toEqual(expect.arrayContaining(["compromisso", "numero_sem_fonte", "dado_sensivel"]));
  });
});

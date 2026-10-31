// Ação sugerida determinística (docs/decisoes.md, seções 5, 6 e 13).
// Função pura: sem chamadas externas. O nível vem de lib/policy; aqui se escolhe o que fazer.

import { nivelMotivo, type Motivo, type Nivel, type StatusEntrega } from "../policy";

export type Autonomia = "executa" | "prepara_e_aguarda_aprovacao" | "escala_para_humano";

export type CodigoAcao =
  // nível 0
  | "informar_status_pedido"
  | "recusar_alteracao_endereco"
  | "informar_status_pagamento"
  | "registrar_elogio"
  | "responder_com_politica"
  | "informar_central_privacidade"
  | "responder_com_faq"
  // nível 1
  | "preparar_resposta_situacao_pedido"
  | "abrir_chamado_transportadora"
  | "verificar_entrega_transportadora"
  | "preparar_orientacao_pagamento"
  | "preparar_reenvio"
  | "solicitar_fotos_e_preparar_reposicao"
  | "preparar_cancelamento"
  | "preparar_devolucao"
  | "preparar_alteracao_endereco"
  | "preparar_recusa_alteracao_endereco"
  | "preparar_troca"
  | "preparar_rascunho_resposta"
  | "preparar_triagem"
  // nível 2
  | "encaminhar_responsavel_tecnica"
  | "encaminhar_financeiro"
  | "escalar_atendimento_humano";

export interface AcaoSugerida {
  acao: CodigoAcao;
  descricao: string; // texto interno para quem opera, não para o cliente
  autonomia: Autonomia;
  ajuste?: string; // presente só quando a trava elevou a autonomia
}

type Base = Omit<AcaoSugerida, "autonomia" | "ajuste">;
type Escolha = (status: StatusEntrega) => Base;

export const AUTONOMIA_POR_NIVEL: Readonly<Record<Nivel, Autonomia>> = {
  0: "executa",
  1: "prepara_e_aguarda_aprovacao",
  2: "escala_para_humano",
};

const STATUS_ENVIADO: ReadonlySet<StatusEntrega> = new Set<StatusEntrega>([
  "em_transito",
  "entregue",
  "atrasado",
]);

function fixa(acao: CodigoAcao, descricao: string): Escolha {
  return () => ({ acao, descricao });
}

// Motivos que pressupõem o pedido recebido: com outro status, há incoerência a conferir.
function exigeEntrega(base: Base): Escolha {
  return (status) =>
    status === "entregue"
      ? base
      : {
          acao: "preparar_triagem",
          descricao: `Status "${status}" não indica entrega, mas o motivo pressupõe pedido recebido. Conferir o pedido antes de propor ação.`,
        };
}

function rascunho(assunto: string): Escolha {
  return fixa(
    "preparar_rascunho_resposta",
    `Preparar rascunho de resposta sobre ${assunto} para aprovação humana.`,
  );
}

// Nível 0: só os motivos que lib/policy permite em nível 0 (com o status e a FAQ dados).
// null = inalcançável, porque a trava impede nível 0 para o motivo.
const NIVEL_0: Readonly<Record<Motivo, Escolha | null>> = {
  rastreio: fixa("informar_status_pedido", "Informar o status atual do pedido em trânsito ao cliente."),
  endereco: fixa(
    "recusar_alteracao_endereco",
    "Recusar a alteração com explicação: a política só permite alterar o endereço antes da separação.",
  ),
  pagamento_pendente: fixa("informar_status_pagamento", "Informar que o pagamento está pendente e como concluí-lo."),
  elogio: fixa("registrar_elogio", "Agradecer e registrar o elogio."),
  duvida_politica: fixa(
    "responder_com_politica",
    "Responder com a entrada correspondente da FAQ de política.",
  ),
  direitos_titular: fixa(
    "informar_central_privacidade",
    "Informar a Central de Privacidade e o prazo de resposta de até 15 dias informado por ela.",
  ),
  duvida_produto: fixa("responder_com_faq", "Responder com a entrada validada da FAQ de produto."),
  promo_cupom: fixa("responder_com_faq", "Responder com a entrada validada da FAQ de promoções."),
  atraso: null,
  item_faltando: null,
  brinde: null,
  avaria: null,
  personalizacao_erro: null,
  cancelamento: null,
  troca_tamanho: null,
  fragrancia: null,
  financeiro_cobranca: null,
  reacao_adversa: null,
  nao_classificado: null,
};

function situacaoPedido(status: StatusEntrega): Base {
  switch (status) {
    case "atrasado":
    case "em_transito":
      return {
        acao: "abrir_chamado_transportadora",
        descricao: "Abrir chamado na transportadora sobre o pedido e preparar resposta ao cliente para aprovação.",
      };
    case "entregue":
      return {
        acao: "verificar_entrega_transportadora",
        descricao: "Pedido consta como entregue: verificar a entrega com a transportadora e preparar resposta para aprovação.",
      };
    case "aguardando_pagamento":
      return {
        acao: "preparar_orientacao_pagamento",
        descricao: "Pedido aguarda pagamento: preparar orientação para concluir o pagamento, para aprovação.",
      };
    case "em_separacao":
      return {
        acao: "preparar_resposta_situacao_pedido",
        descricao: "Pedido em separação: preparar resposta com a situação do pedido, para aprovação.",
      };
  }
}

// Nível 1: prepara ação e resposta; uma pessoa aprova.
// null = inalcançável, porque o nível mínimo do motivo é 2.
const NIVEL_1: Readonly<Record<Motivo, Escolha | null>> = {
  rastreio: (status) =>
    status === "em_transito"
      ? {
          acao: "preparar_resposta_situacao_pedido",
          descricao: "Preparar resposta com o status do pedido em trânsito, para aprovação.",
        }
      : situacaoPedido(status),
  atraso: situacaoPedido,
  endereco: (status) =>
    STATUS_ENVIADO.has(status)
      ? {
          acao: "preparar_recusa_alteracao_endereco",
          descricao: `Pedido com status "${status}": preparar recusa da alteração com explicação, para aprovação.`,
        }
      : {
          acao: "preparar_alteracao_endereco",
          descricao: `Pedido com status "${status}": preparar a alteração de endereço, para aprovação.`,
        },
  item_faltando: exigeEntrega({
    acao: "preparar_reenvio",
    descricao: "Preparar reenvio do item faltante, para aprovação após conferência do pedido.",
  }),
  brinde: exigeEntrega({
    acao: "preparar_reenvio",
    descricao: "Preparar reenvio do brinde, para aprovação após conferência do pedido.",
  }),
  avaria: exigeEntrega({
    acao: "solicitar_fotos_e_preparar_reposicao",
    descricao: "Pedir fotos da avaria e preparar reposição ou troca, para aprovação.",
  }),
  personalizacao_erro: exigeEntrega({
    acao: "solicitar_fotos_e_preparar_reposicao",
    descricao: "Pedir fotos do erro de personalização e preparar reposição, para aprovação.",
  }),
  cancelamento: (status) =>
    STATUS_ENVIADO.has(status)
      ? {
          acao: "preparar_devolucao",
          descricao:
            "Pedido já enviado: preparar devolução ou arrependimento para aprovação. A janela de 7 dias não pode ser validada automaticamente.",
        }
      : {
          acao: "preparar_cancelamento",
          descricao: `Pedido com status "${status}": preparar o cancelamento, para aprovação.`,
        },
  troca_tamanho: exigeEntrega({
    acao: "preparar_troca",
    descricao: "Preparar troca de tamanho ou modelo, para aprovação.",
  }),
  fragrancia: exigeEntrega({
    acao: "preparar_troca",
    descricao: "Preparar troca por fragrância, para aprovação.",
  }),
  pagamento_pendente: rascunho("o pagamento pendente"),
  elogio: rascunho("o elogio"),
  duvida_politica: rascunho("a política consultada"),
  direitos_titular: rascunho("direitos do titular de dados"),
  duvida_produto: rascunho("o produto, sem entrada validada na FAQ"),
  promo_cupom: rascunho("promoção ou cupom, sem entrada validada na FAQ"),
  nao_classificado: fixa(
    "preparar_triagem",
    "Motivo não identificado: encaminhar para triagem humana com rascunho, para aprovação.",
  ),
  financeiro_cobranca: null,
  reacao_adversa: null,
};

// Nível 2: humano obrigatório; o agente só resume e prioriza. Não há resposta ao cliente:
// as descrições dizem o que a pessoa da equipe faz.
function nivel2(motivo: Motivo, status: StatusEntrega): Base {
  if (motivo === "reacao_adversa") {
    return {
      acao: "encaminhar_responsavel_tecnica",
      descricao:
        "Encaminhar à responsável técnica em até 24 horas. Quem atende orienta a suspender o uso e pede produto, lote, descrição e fotos para o registro de cosmetovigilância; a troca não substitui o registro.",
    };
  }
  if (motivo === "financeiro_cobranca") {
    return {
      acao: "encaminhar_financeiro",
      descricao:
        "Encaminhar ao financeiro com resumo; não há dados de pagamento. O resumo traz o prazo de estorno da política para quem atende; nenhum estorno é confirmado antes da verificação.",
    };
  }
  const sugestao =
    motivo === "endereco" && STATUS_ENVIADO.has(status)
      ? " Sugestão: recusa da alteração, pois o pedido já saiu da separação."
      : "";
  return {
    acao: "escalar_atendimento_humano",
    descricao: `Encaminhar à fila humana prioritária com resumo da conversa e das razões do nível.${sugestao}`,
  };
}

function validarNivel(nivel: number): asserts nivel is Nivel {
  if (nivel !== 0 && nivel !== 1 && nivel !== 2) {
    throw new RangeError(`nível inválido: ${nivel}`);
  }
}

export function acaoSugerida(
  motivo: Motivo,
  nivel: Nivel,
  statusEntrega: StatusEntrega,
  faqValidada: ReadonlySet<Motivo> = new Set(), // sem FAQ validada (padrão conservador)
): AcaoSugerida {
  validarNivel(nivel);

  // Trava: vale a autonomia mais restritiva entre o nível recebido e o mínimo do motivo.
  const minimo = nivelMotivo(motivo, statusEntrega, faqValidada);
  const efetivo = Math.max(nivel, minimo.nivel) as Nivel;

  let base: Base;
  if (efetivo === 2) {
    base = nivel2(motivo, statusEntrega);
  } else {
    const escolha = (efetivo === 0 ? NIVEL_0 : NIVEL_1)[motivo];
    if (escolha === undefined) {
      // Motivo fora do tipo (só em tempo de execução): triagem humana.
      base = NIVEL_1.nao_classificado!(statusEntrega);
    } else if (escolha === null) {
      throw new Error(`inconsistência entre lib/policy e lib/acoes: ${motivo} no nível ${efetivo}`);
    } else {
      base = escolha(statusEntrega);
    }
  }

  const resultado: AcaoSugerida = { ...base, autonomia: AUTONOMIA_POR_NIVEL[efetivo] };
  if (efetivo > nivel) {
    resultado.ajuste = `autonomia elevada do nível ${nivel} para o ${efetivo}: ${minimo.razao}`;
  }
  return resultado;
}

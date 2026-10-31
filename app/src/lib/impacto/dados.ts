// Números da análise copiados dos agregados gerados por analysis/analise_atendimento.py.
// Cada número guarda o arquivo de data/processed/ e a chave de onde veio; o teste (impacto.test.ts)
// compara cada um com o arquivo quando ele existe. Contagens são da amostra (4.000 conversas, 1 em cada
// 3 clientes); valores em R$ já vêm estimados para a população (amostra × 3, FATOR_AMOSTRA no script).
// Para atualizar: rode o script, copie os valores novos aqui e rode npm test.

export type Arquivo =
  | "metricas.json"
  | "autonomia.csv"
  | "canais_custos.csv"
  | "motivos_custos.csv"
  | "grupos_evitaveis.csv"
  | "concordancia_tags.csv"
  | "sla.csv"
  | "transportadoras.csv";

export interface Agregado {
  valor: number;
  arquivo: Arquivo;
  // metricas.json: caminho com pontos. CSV: "<valor da 1ª coluna>.<coluna>".
  chave: string;
}

function de(arquivo: Arquivo, chave: string, valor: number): Agregado {
  return { valor, arquivo, chave };
}

const J = "metricas.json";

export const AGREGADOS = {
  // validação da base
  conversasAmostra: de(J, "validacao.conversas", 4000),
  mensagens: de(J, "validacao.mensagens", 14559),
  pedidos: de(J, "validacao.pedidos", 3237),
  conversasDuplicadas: de(J, "validacao.conversas_duplicadas", 0),
  mensagensDuplicadas: de(J, "validacao.mensagens_duplicadas", 0),
  conversasComMensagem: de(J, "resumo.conversas_com_mensagem_do_cliente", 3541),

  // o problema
  conversasEstimadas: de(J, "resumo.conversas_estimadas_populacao", 12000),
  custoEstimado: de(J, "resumo.custo_estimado_populacao_rs", 108299),
  foraDoHorario: de(J, "pct_abertas_fora_do_horario", 30.3),
  raPctConversas: de("canais_custos.csv", "reclame_aqui.pct_conversas", 10.2),
  raPctCusto: de("canais_custos.csv", "reclame_aqui.pct_custo", 47.4),
  custoEmail: de("canais_custos.csv", "email.custo_rs", 15832.8),
  custoReclameAqui: de("canais_custos.csv", "reclame_aqui.custo_rs", 51282.0),
  custoWhatsapp: de("canais_custos.csv", "whatsapp.custo_rs", 41184.0),
  atrasoPctCusto: de("motivos_custos.csv", "atraso.pct_custo", 19.5),
  rastreioPctCusto: de("motivos_custos.csv", "rastreio.pct_custo", 17.3),
  slaWhatsappEstouro: de("sla.csv", "whatsapp.pct_estouro_sla", 20.3),
  slaWhatsappConversas: de("sla.csv", "whatsapp.conversas", 2398),
  rotaExpressLogistica: de("transportadoras.csv", "Rota Express.pct_nos_contatos_logisticos", 62.76),
  rotaExpressReferencia: de("transportadoras.csv", "Rota Express.pct_na_referencia", 20.38),
  rotaExpressRazao: de("transportadoras.csv", "Rota Express.razao", 3.08),
  raRecontato: de(J, "recontato_escalada.pct_ra_recontato", 36.1),
  demaisRecontato: de(J, "recontato_escalada.pct_demais_recontato", 17.1),

  // contatos potencialmente evitáveis (hipótese)
  falhaProcesso: de("grupos_evitaveis.csv", "falha_de_processo.conversas", 1445),
  comunicacaoProativa: de("grupos_evitaveis.csv", "comunicacao_proativa_ou_autoatendimento.conversas", 1496),
  exigePessoa: de("grupos_evitaveis.csv", "exige_pessoa.conversas", 547),
  semAcao: de("grupos_evitaveis.csv", "sem_acao.conversas", 512),
  recontato: de(J, "recontato_escalada.pct_conversas_recontato", 19.1),
  custoRecontato: de(J, "recontato_escalada.custo_recontato_rs", 28343),
  atrasoEmTransito: de(J, "pct_atraso_com_status_em_transito", 72.0),

  // simulação de autonomia (classificador por regras do script)
  nivel0Conversas: de("autonomia.csv", "0.conversas", 513),
  nivel0PctConversas: de("autonomia.csv", "0.pct_conversas", 14.5),
  nivel0PctCusto: de("autonomia.csv", "0.pct_custo", 8.1),
  nivel1Conversas: de("autonomia.csv", "1.conversas", 2017),
  nivel1PctConversas: de("autonomia.csv", "1.pct_conversas", 57.0),
  nivel1PctCusto: de("autonomia.csv", "1.pct_custo", 31.7),
  nivel2Conversas: de("autonomia.csv", "2.conversas", 1011),
  nivel2PctConversas: de("autonomia.csv", "2.pct_conversas", 28.6),
  nivel2PctCusto: de("autonomia.csv", "2.pct_custo", 60.1),

  // como defendemos as conclusões
  concordanciaGeral: de(J, "concordancia_tag_geral", 0.713),
  reacaoConversas: de(J, "reacao_adversa.conversas", 40),
  reacaoConcordancia: de("concordancia_tags.csv", "reacao_adversa.concordancia", 0.2),
  reacaoTagPropria: de(J, "reacao_adversa.com_tag_especifica", 0),
  reacaoCitaRegistro: de(J, "reacao_adversa.agente_cita_registro_ou_lote", 0),
  reacaoOfereceTroca: de(J, "reacao_adversa.agente_oferece_troca", 40),
  msgsCliente: de(J, "pii_nas_mensagens.msgs_cliente", 5684),
  comCpf: de(J, "pii_nas_mensagens.com_cpf", 174),
  comTelefone: de(J, "pii_nas_mensagens.com_telefone", 91),
  comCartao: de(J, "pii_nas_mensagens.com_cartao", 45),

  // limites
  proximaRaComAmeaca: de(J, "recontato_escalada.p_proxima_ra_com_ameaca", 0.5),
  proximaRaSemAmeaca: de(J, "recontato_escalada.p_proxima_ra_sem_ameaca", 0.108),
  casosComAmeaca: de(J, "recontato_escalada.n_com_ameaca", 34),
} as const satisfies Record<string, Agregado>;

export type ChaveAgregado = keyof typeof AGREGADOS;

# Decisões de projeto: Agente de Atendimento (Gocase e GoBeauté)

Status: desenho aprovado, números preliminares. Os valores abaixo são estimativas feitas com um classificador por regras sobre a amostra do desafio (1 em cada 3 clientes). Serão revalidados em `analysis/`.

## 1. Objetivo e métricas

O agente existe para dar à liderança uma visão confiável de por que os clientes procuram o atendimento e para agir sobre cada conversa com o nível certo de autonomia.

Métricas principais:
1. **Precisa de humano ou não:** percentual de conversas por nível de autonomia.
2. **Contatos evitados:** conversas que não precisariam existir (aviso proativo, autoatendimento, correção de processo).

Métrica associada (não central): R$ economizados por automação. O custo por conversa do `parametros.md` é por canal, não por quem atende, então não serve como prova direta de economia.

## 2. O que os dados mostram (preliminar)

- Custo estimado no período: ~R$ 108 mil (~12 mil conversas, amostra escalada ×3).
- Atraso e rastreio juntos: ~37% do custo (19,5% + 17,3%).
- Reclame Aqui: ~10% das conversas, ~47% do custo (R$ 42 por conversa).
- A tag manual é coerente com o motivo inferido em 71% das conversas (divergência de até ~29%, um teto: parte vem de conversas com dois assuntos e de limites do classificador). A concordância é de apenas 20% nos casos de reação adversa. As conversas sem tag são exatamente as que só têm a saudação do bot.
- A tag divergente não mudou a resolução (62,4% com tag coerente contra 61,8% com divergente); o custo é de visibilidade para a liderança.
- 19% das conversas são a 2ª ou posterior do mesmo pedido (~R$ 28 mil, ~26% do custo).
- Reclame Aqui tende a ser fim de escalada: 36% das conversas do canal são recontato, contra 17% nos demais. Com ameaça de reclamação, a próxima conversa do pedido é no Reclame Aqui em 50% dos casos, contra 11% sem ameaça (só 34 casos com ameaça: indício, não prova).
- Rota Express aparece em 63% dos contatos de rastreio e atraso, contra ~20% na referência (~3,1×), concentrada no Nordeste: CE 3,5×, RN 4,7×, PB 5,5×, PE 2,3×, BA 1,8×. A base de comparação é aproximada.
- Em 72% das reclamações de atraso, o status do pedido ainda é "em trânsito".
- 40 conversas de reação adversa: nenhuma com tag própria, nenhuma cita registro ou lote, e em todas o agente humano ofereceu troca.
- ~30% dos contatos chegam fora das 8h às 20h, quando só o bot responde. No WhatsApp, a mediana da primeira resposta é de 12 min e ~20% estouram o SLA em horário comercial.

## 3. Taxonomia de motivos

Rastreio, atraso, item faltando, brinde, avaria, erro de personalização, cancelamento, endereço, cobrança/financeiro, pagamento pendente, promoção/cupom, troca ou devolução, fragrância, dúvida de produto, elogio e **reação adversa** (categoria nova, não existe na lista de tags atual). Cada motivo é mapeado para as 13 tags originais para comparação. Conversas podem ter mais de um motivo (6% das aberturas).

## 4. Desenho do agente

Princípio: **o LLM entende e redige; o código decide.** A regra de autonomia é determinística e testável, nunca fica no prompt.

1. Mascarar dados pessoais antes de qualquer chamada ao modelo.
2. Classificar os motivos (multi-rótulo) com o LLM, com saída estruturada.
3. Buscar fatos do pedido em código: status de entrega, transportadora, UF, valor, dias desde o pedido, nº de contatos anteriores, canal.
4. Aplicar a regra de autonomia (módulo de política).
5. Redigir a resposta com a política aplicável e devolver uma ação estruturada: motivos, confiança, ação proposta, nível, resposta e justificativa.

O agente também sinaliza **risco de escalada para o Reclame Aqui** (recontato, ameaça de reclamação, atraso sem resposta) para priorizar a fila.

## 5. Níveis de autonomia

**Nível 0, o agente responde e executa sozinho** (só com base factual disponível):
- rastreio de pedido em trânsito
- pagamento pendente
- elogio
- perguntas puramente informativas de política (como funciona a troca) e direitos do titular de dados (indica a Central de Privacidade)
- dúvida de produto e cupom **somente** quando houver entrada validada na FAQ

**Nível 1, o agente prepara ação e resposta, a pessoa aprova:**
- atraso, avaria, item faltando, brinde, erro de personalização
- cancelamento, troca e devolução, alteração de endereço
- arrependimento (sempre nível 1)
- dúvida de produto e cupom sem entrada validada na FAQ

**Nível 2, humano obrigatório; o agente só resume e prioriza:**
- reação adversa a produto (sempre)
- cobrança duplicada ou não reconhecida
- qualquer assunto de saúde (gravidez, ingredientes, alergia)
- ameaça jurídica ou de reclamação pública

**Escalonadores** (só sobem o nível):
- canal Reclame Aqui: nível 2
- 2º contato no pedido: pelo menos nível 1; 3º contato: nível 2
- valor do pedido acima de R$ 200 (cobre ~95% dos pedidos): pelo menos nível 1
- confiança do modelo abaixo do limiar: sobe um nível
- várias intenções na mesma conversa: vale o nível mais restritivo

**Princípio:** explicar política é nível 0; executar ou aprovar (reenvio, cancelamento, reembolso, troca) é nível 1, porque exige fatos que o agente não tem (foto, data de recebimento).

Simulação preliminar (3.541 conversas com mensagem do cliente), com a FAQ de produto e promoção pendente: nível 0 ≈ 14,5%, nível 1 ≈ 57%, nível 2 ≈ 28,6%. O nível 2 concentra ~60% do custo por causa do Reclame Aqui. O efeito de preencher a FAQ pode ser simulado ajustando `FAQ_VALIDADA` no script.

## 6. Regras específicas

- **Reação adversa:** fluxo fixo. Orientar a suspender o uso, pedir produto, lote, descrição e fotos, e encaminhar à responsável técnica em até 24 horas. A troca não substitui o registro de cosmetovigilância.
- **Endereço:** recusa automática (com explicação) se o pedido está em trânsito ou entregue; assistido (nível 1) se em separação, pois a política só permite alterar antes da separação.
- **Arrependimento:** nível 1. Não há data de recebimento nos dados, então a janela de 7 dias não pode ser validada automaticamente.
- **Cobrança duplicada:** não há dados de pagamento; a resposta cita o prazo de estorno da política e encaminha ao financeiro.

## 7. FAQ em duas camadas

1. **Política:** preenchida a partir do `parametros.md` (arrependimento, avaria e item faltante, troca por fragrância, cobrança duplicada, personalização, endereço, reação adversa) e do Aviso de Privacidade público do gogroup (direitos do titular, canal e prazo de 15 dias).
2. **Produto e promoções:** estrutura pronta, **conteúdo pendente**. Os sites oficiais consultados não trazem regras de cupom, frete grátis, cashback nem ficha de produto, e não se inventa regra da empresa. Cada entrada declara sua fonte. Sem entrada validada, a conversa cai no nível 1 com rascunho.

Perguntas de saúde nunca são respondidas pela FAQ.

## 8. Privacidade

- Mascarar CPF, telefone, e-mail e número de cartão antes de enviar texto ao modelo. O cartão não consta entre os dados que a empresa declara coletar, então é sempre removido.
- O agente nunca pede CPF, cartão ou senha no chat.
- A aplicação não guarda o texto das conversas: processa, devolve a decisão e descarta.
- Os dados brutos do desafio não ficam no repositório; só código e agregados.
- Toda decisão sai com justificativa registrada, para permitir revisão humana.

## 9. Avaliação

Não há rótulo verdadeiro. Plano: rotular à mão ~60 conversas e medir classificação e nível de autonomia contra elas, reportando acertos e erros, em vez de confiar só nas regras usadas na exploração.

## 10. Limitações

- O classificador de exploração é por regras e aproximado.
- Faltam data de entrega, dados de pagamento, fotos e base de produtos.
- Os dados são sintéticos e textualmente repetitivos; o desempenho em texto real pode ser menor.
- A comparação por transportadora e UF usa uma base de referência aproximada.
- Os custos por conversa não distinguem bot de humano.

## 11. Pendências

- Preencher a FAQ de produto e promoções se houver fonte validada.
- Rotular a amostra de avaliação.
- Definir o limiar de confiança.

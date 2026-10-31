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

Rastreio, atraso, item faltando, brinde, avaria, erro de personalização, cancelamento, endereço, cobrança/financeiro, pagamento pendente, promoção/cupom, troca ou devolução, fragrância, dúvida de produto, elogio e **reação adversa** (categoria nova, não existe na lista de tags atual). O app acrescenta dúvida de política e direitos do titular (ver seção 12). Cada motivo é mapeado para as 13 tags originais para comparação. Conversas podem ter mais de um motivo (6% das aberturas).

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
- perguntas puramente informativas de política (como funciona a troca) e direitos do titular de dados (indica a Central de Privacidade), **somente** quando houver entrada de FAQ correspondente
- dúvida de produto e cupom **somente** quando houver entrada validada na FAQ

**Nível 1, o agente prepara ação e resposta, a pessoa aprova:**
- atraso, avaria, item faltando, brinde, erro de personalização
- cancelamento, troca e devolução, alteração de endereço
- arrependimento (sempre nível 1)
- dúvida de produto e cupom sem entrada validada na FAQ
- dúvida de política e direitos do titular sem entrada de FAQ correspondente

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

1. **Política:** preenchida a partir do `parametros.md` (arrependimento, avaria e item faltante, troca por fragrância, cobrança duplicada, personalização, endereço, reação adversa) e da Central de Privacidade do GoGroup (https://privacidade.devgogroup.com: direitos do titular, canal e prazo de resposta de até 15 dias a partir do recebimento). O prazo consta na Central de Privacidade; o Aviso de Privacidade (`/politica`) não informa prazo.
2. **Produto e promoções:** estrutura pronta, **conteúdo pendente**. Os sites oficiais consultados não trazem regras de cupom, frete grátis, cashback nem ficha de produto, e não se inventa regra da empresa. Cada entrada declara sua fonte. Sem entrada validada, a conversa cai no nível 1 com rascunho.

Perguntas de saúde nunca são respondidas pela FAQ.

Implementação (`app/src/lib/faq`):
- O repositório é público: os textos são paráfrases próprias, só da política voltada ao cliente, sem custos internos, SLAs ou volumes. A fonte é rotulada como "política de atendimento do desafio" ou "Central de Privacidade do GoGroup". Antes do commit, um script descartável (fora do repositório) confirmou que nenhuma sequência de 5 ou mais palavras coincide com o documento do desafio.
- Cada entrada tem `id`, `camada`, `motivos`, `topico`, `texto`, `fonte`, `validada` e `uso`. **`validada: true` significa conferida com o documento do desafio ou com a página pública citada.**
- `uso: "cliente"` pode virar resposta; `uso: "interno"` (reação adversa e cobrança duplicada) só guia o resumo dos casos de nível 2 e nunca gera resposta ao cliente.
- `faqValidada()` devolve os motivos com pelo menos uma entrada validada de uso "cliente". Hoje exclui `duvida_produto` e `promo_cupom` (camada de produto vazia).
- `buscarFaq({ motivo, topico?, saude })` é determinística (ordem por `id`), só devolve entradas validadas de uso "cliente" e devolve vazio para assunto de saúde. Sem tópico, só responde quando o motivo tem um único tópico possível; por isso `duvida_politica` sem tópico correspondente fica sem entrada.
- `faqParaConsulta({ topico?, saude })` monta o conjunto de FAQ de uma conversa (motivos para os quais a busca acha entrada). A parte 3 calcula esse conjunto uma vez e passa o mesmo para `decidirNivel` e `acaoSugerida`. Assim, `duvida_politica` só vai a nível 0 quando o tópico da pergunta tem entrada.
- Brinde não tem entrada (a política não trata dele) e continua em nível 1.
- `PADROES_COMPROMISSO` (exportado de `lib/faq`) lista verbos de compromisso proibidos em texto ao cliente (garantimos, vamos reembolsar, já reenviamos, será reembolsado, será reenviado). Os testes garantem que nenhuma entrada de uso "cliente" os contém; a parte 3 reaproveita a lista na checagem do texto redigido.

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
- Calibrar o limiar de confiança (valor inicial 0,7) com a amostra rotulada.
- Alinhar o script Python à regra do app: hoje `FAQ_VALIDADA` zera qualquer motivo, e o script não tem `duvida_politica` nem `direitos_titular` (que no app exigem entrada de FAQ para nível 0).

## 12. Implementação da regra (`app/src/lib/policy`)

A função `decidirNivel` é pura e devolve `{ nivel, razoes }`, com uma razão legível para cada regra cuja condição foi atendida. Decisões tomadas na implementação:

- **Motivos novos:** `duvida_politica` (pergunta informativa de política, como "como funciona a troca") e `direitos_titular` (indica a Central de Privacidade) têm nível-base 1 e só descem para 0 com entrada de FAQ correspondente (mudança da parte 2). **Eles não existem na taxonomia do script Python** (`analysis/analise_atendimento.py`); lá essas conversas caem em outros motivos ou em `nao_classificado`.
- **Arrependimento** continua dentro de `cancelamento` (nível 1), como no script.
- **FAQ validada** só baixa para 0 `duvida_produto`, `promo_cupom`, `duvida_politica` e `direitos_titular`. Nenhum outro motivo é afetado pela FAQ (no script Python, qualquer motivo é).
- **Status de entrega:** `entregue`, `em_transito`, `em_separacao`, `atrasado` e `aguardando_pagamento`. Rastreio é nível 0 só em `em_transito`; nos outros status, nível 1. Endereço é nível 0 (recusa automática com explicação) em `em_transito`, `entregue` e `atrasado`; nível 1 (assistido) em `em_separacao` e `aguardando_pagamento`.
- **Ordem:** nível-base por motivo → mais restritivo entre os motivos → Reclame Aqui → nº do contato → valor → saúde/ameaça → confiança. A confiança vem por último e soma um nível ao resultado (máximo 2), o que é a opção mais conservadora: valor de R$ 250 com confiança 0,5 resulta em nível 2.
- **Bordas:** o valor escala só quando é estritamente maior que R$ 200; a confiança escala só quando é estritamente menor que `LIMIAR_CONFIANCA` (0,7).
- **Lista de motivos vazia ou motivo desconhecido:** nível 1.
- **Entrada inválida** (confiança fora de 0 a 1 ou NaN, `seq` não inteiro ou menor que 1, valor negativo ou não finito): a função lança `RangeError`. **A rota do agente deve capturar esse erro e responder em nível 2 com a razão "entrada inválida".**

## 13. Ação sugerida (`app/src/lib/acoes`)

A função `acaoSugerida(motivo, nivel, statusEntrega, faqValidada?)` é pura e devolve `{ acao, descricao, autonomia, ajuste? }`. O nível final vem de `decidirNivel` (já com os escalonadores); aqui só se escolhe o que fazer dentro da autonomia correspondente: nível 0 `executa`, nível 1 `prepara_e_aguarda_aprovacao`, nível 2 `escala_para_humano`. A `descricao` é texto interno para quem opera, não resposta ao cliente.

- **Trava única:** a autonomia efetiva é a mais restritiva entre a do nível recebido e a do nível mínimo do motivo dado o status. O mínimo vem de `nivelMotivo` (exportada de `lib/policy`), sem duplicar tabelas. Isso garante, por exemplo, que reação adversa e cobrança sempre escalam, que atraso nunca executa e que rastreio só executa em trânsito.
- **Ajuste:** quando a trava eleva a autonomia, o retorno traz `ajuste` com a razão (nível recebido, nível efetivo e a razão de `nivelMotivo`).
- **FAQ:** o parâmetro `faqValidada` é opcional e vazio por padrão, o que é conservador: sem ele, dúvida de produto e cupom nunca executam.
- **Destinos do nível 2:** reação adversa vai à responsável técnica em até 24 horas (fluxo da seção 6); cobrança vai ao financeiro, sem prometer reembolso; os demais motivos vão à fila humana prioritária com resumo. Endereço já enviado leva a sugestão de recusa no resumo.
- **Endereço:** nível 0 recusa com explicação em `em_transito`, `entregue` e `atrasado`; com nível 1 nesses status, prepara a recusa para aprovação; em `em_separacao` e `aguardando_pagamento`, prepara a alteração.
- **Coerência de status:** item faltando, brinde, avaria, erro de personalização, troca e fragrância pressupõem o pedido entregue; com outro status, a ação é triagem para conferir o pedido.
- **Entradas fora do tipo:** nível diferente de 0, 1 e 2 lança `RangeError` (a rota responde em nível 2); motivo desconhecido vai para triagem.
- **Dúvida de política e direitos do titular:** só ficam em nível 0 se houver entrada de FAQ correspondente; sem ela, nível 1 (regra de `lib/policy`, seção 12).

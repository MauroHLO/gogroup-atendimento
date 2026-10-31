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
- **Cobrança duplicada:** não há dados de pagamento; é nível 2, então não há resposta ao cliente: o resumo interno traz o prazo de estorno da política para quem atende, e o caso vai ao financeiro.

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
- **Destinos do nível 2:** reação adversa vai à responsável técnica em até 24 horas (fluxo da seção 6); cobrança vai ao financeiro, sem confirmar estorno; os demais motivos vão à fila humana prioritária com resumo. Endereço já enviado leva a sugestão de recusa no resumo. Como no nível 2 não há resposta ao cliente, as descrições dizem o que a pessoa da equipe faz (por exemplo, "quem atende orienta a suspender o uso"), nunca "a resposta"; há teste para isso.
- **Endereço:** nível 0 recusa com explicação em `em_transito`, `entregue` e `atrasado`; com nível 1 nesses status, prepara a recusa para aprovação; em `em_separacao` e `aguardando_pagamento`, prepara a alteração.
- **Coerência de status:** item faltando, brinde, avaria, erro de personalização, troca e fragrância pressupõem o pedido entregue; com outro status, a ação é triagem para conferir o pedido.
- **Entradas fora do tipo:** nível diferente de 0, 1 e 2 lança `RangeError` (a rota responde em nível 2); motivo desconhecido vai para triagem.
- **Dúvida de política e direitos do titular:** só ficam em nível 0 se houver entrada de FAQ correspondente; sem ela, nível 1 (regra de `lib/policy`, seção 12).

## 14. Agente (`app/src/lib/agent`)

### Sinais de saúde e ameaça (`sinais.ts`)

O sinal final é "ou" entre a saída do modelo e as palavras-chave. As palavras-chave são as de `RE_SAUDE` e `RE_AMEACA` de `analysis/analise_atendimento.py`, aplicadas sobre texto normalizado (minúsculas, sem acento), com estas **divergências em relação ao script Python**:

- Normalização: "gravida", "bebe", "justica" e "reclamacao" sem acento também casam (no Python, só com acento).
- "queima" foi restrita a `queimadura|queimou|queimei|queimando`, para não pegar "queima de estoque".
- "grávida", "bebê" e "fórmula" exigem palavra inteira (`\bgravidas?\b`, `\bbebes?\b`, `\bformulas?\b`), porque, sem acento, pegariam "gravidade", "bebeu" e "formulário". "gravidez" continua como está.
- "bolinhas" deixou de ser termo solto: só casa com contexto de pele, `bolinhas\s+(na|no|pela|pelo|em)\s+(pele|rosto|corpo|braco|perna)\b`, porque "capinha de bolinhas" é estampa comum.
- "meu filho" e "minha filha" exigem fim de palavra (`meu\s+filho\b`, `minha\s+filha\b`), para não pegar "meu filhote".
- "justiça" exige palavra inteira (`\bjustica\b`), para não pegar "injustiça" (desabafo, não ameaça).
- Espaços entre palavras aceitam qualquer quantidade (`\s+`).
- **Colisões aceitas como estão** (erro na direção conservadora): `\bbebes?\b` também pega o verbo "bebe"; `queimou` também pega "o carregador queimou"; `reclame\s+aqui` também pega o imperativo "reclame aqui no chat".

Os números da análise continuam vindo do script Python; a divergência só afeta o app, e na direção mais conservadora (mais casos com sinal), exceto pelas restrições acima, que removem falsos positivos.

### Esquemas (`esquema.ts`)

- O zod valida a classificação (`motivos` de 1 a 3, `topico` da FAQ ou `null`, `confianca` de 0 a 1, `saude`, `ameaca`) e a redação (`resposta` de 1 a 700 caracteres). Campos extras vindos do modelo, como `nivel` ou `acao`, são descartados: o modelo nunca decide nível nem ação.
- O esquema JSON do modo estrito do Groq é derivado do zod com `z.toJSONSchema`, sem `$schema`, com todos os objetos fechados (`additionalProperties: false`) e todas as propriedades obrigatórias. A documentação do Groq não informa suporte a `minimum`, `maximum`, `minItems`, `maxItems`, `minLength` e `maxLength` no modo estrito; esses limites ficam **só no zod**.
- Resposta inválida do modelo, depois da nova tentativa, vira `nao_classificado` com confiança 0 (que resulta em nível 2 pela regra de confiança).

### Checagem do texto redigido (`checagem.ts`)

Vale para os níveis 0 e 1. O texto reprova se tiver: afirmação de ação já cumprida (`PADROES_ACAO_FEITA`, ver abaixo); número em algarismos que não esteja nas entradas de FAQ usadas nem nos fatos do contexto; número por extenso (exceto "um" e "uma"); verbo de compromisso (`PADROES_COMPROMISSO`); menção a CPF, cartão, senha, CVV ou código de segurança (conservador: até "não precisa mandar o CPF" reprova); link que não esteja nas entradas de FAQ usadas; texto vazio ou acima de 700 caracteres. Se reprovar, o pipeline usa o texto seguro de reserva, que passa em todas as checagens.

### Cliente do modelo (`cliente.ts`)

- Interface `ClienteLLM` injetável; `criarClienteGroq(env, sdk?)` lê `GROQ_API_KEY` e `GROQ_MODEL` do ambiente. Modelo padrão: `openai/gpt-oss-20b`.
- Modo estrito (`json_schema` com `strict: true`) só nos modelos que a documentação do Groq lista com decodificação restrita (`openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `meta-models/muse-spark-open`); nos demais, `json_object`, sempre com validação zod no pipeline.
- Nos modelos gpt-oss: `reasoning_effort: "low"` e `include_reasoning: false`. `temperature: 0`.
- Limites iniciais: `max_completion_tokens` 512 (classificação) e 600 (redação), depois calibrados para 384 e 400 e, por fim, 512 na classificação (ver "Calibração com o smoke test"); 8 s por chamada; `maxRetries: 0` no SDK (a única nova tentativa é a do pipeline, para JSON inválido). A documentação não diz se o raciocínio conta no limite de tokens; os valores serão calibrados com o smoke test.
- `finish_reason: "length"`, conteúdo vazio ou JSON quebrado contam como `json_invalido`.
- Erros do SDK viram `FalhaAgente` com um tipo, sem a mensagem nem a causa original: `timeout`, `rate_limit`, `json_invalido` (inclui o 400 `json_validate_failed`), `config` (401, 403, 404, chave ausente), `requisicao_recusada` (outro 400, como esquema estrito recusado) e `indisponivel` (conexão, 5xx, erro qualquer).

### Prompts (`prompts.ts`)

- A mensagem mascarada vai só na mensagem de usuário, entre `<mensagem_cliente>` e `</mensagem_cliente>`. Qualquer variação do delimitador dentro dela (maiúsculas, espaços, barra) é trocada por `[delimitador removido]`, nos dois prompts.
- O prompt de classificação não menciona nível, autonomia nem ação. O de redação recebe a decisão pronta (descrição da ação), as entradas de FAQ usadas e os fatos do pedido (status, valor e canal), e proíbe números fora dessas informações, promessas e pedido de CPF, cartão ou senha.

### Smoke test (`app/scripts/smoke-groq.ts`)

- Roda com `npm run smoke` (lê `app/.env.local`, fora do Git), com 5 mensagens fictícias. Fica fora do `npm test` e do CI. Imprime só nível, motivos, falha, checagem, tempo e tokens; nunca a chave nem a mensagem. Sai com código 1 se o Groq recusar o esquema estrito e 2 se faltar a chave.
- **O `tsx` é devDependency só do smoke test** (roda TypeScript direto). O app e os testes não dependem dele.

### Calibração com o smoke test (31/10/2026, `openai/gpt-oss-20b`, modo estrito)

Duas rodadas com as 5 mensagens fictícias (a segunda já pelo pipeline). O Groq aceitou o esquema estrito, todas as chamadas terminaram com `finish_reason: "stop"`, todo JSON passou no zod e os 5 casos deram o nível esperado (inclusive a mensagem com injeção, que ficou em nível 1 por atraso). A API informa os tokens de raciocínio, e eles estão incluídos nos tokens de completion.

| Chamada | Tokens de prompt | Tokens de completion (máx.) | Raciocínio (máx.) | Latência |
|---|---|---|---|---|
| Classificação | 998 a 1.016 | 68 a 128 (128) | 25 a 83 (83) | 469 a 888 ms |
| Redação | 367 a 426 | 75 a 87 (87) | 7 a 22 (22) | 397 a 511 ms |

O maior consumo veio da mensagem com injeção (mais raciocínio). Com folga de cerca de 3x e 4,5x sobre o máximo medido, `max_completion_tokens` passou de 512 para **384** (classificação) e de 600 para **400** (redação). Tempo total por conversa: de 0,5 s (nível 2, uma chamada) a 1,3 s (duas chamadas), bem abaixo do orçamento de 12 s. Taxa de fallback na amostra: 0 de 4.

**Revisão (31/10/2026, gravação dos 8 exemplos):** a classificação da mensagem com injeção usou **209 tokens de completion, 164 de raciocínio** na primeira gravação e 208/164 na segunda, contra 128/83 no smoke. O raciocínio varia bastante entre mensagens e rodadas, então `max_completion_tokens` da classificação subiu de 384 para **512** (cerca de 2,4x o máximo medido). A redação continua em **400** (máximo medido de 87, raciocínio incluído). Demais classificações da gravação: de 56 a 123 tokens de completion (7 a 72 de raciocínio).

### Pipeline (`index.ts`, `processarConversa`)

1. Mascara a mensagem (`lib/pii`); só o texto mascarado vai ao modelo.
2. Classifica (1ª chamada). Inválida mesmo após uma nova tentativa vira `nao_classificado` com confiança 0.
3. Sinais: "ou" entre o modelo e as palavras-chave.
4. `faqParaConsulta({ topico, saude })` é calculado **uma vez**, e o mesmo objeto vai para `decidirNivel` e para `acaoSugerida` (há teste com espiões).
5. **Motivo principal:** os motivos são ordenados pelo maior `nivelMotivo` (dado o status e a FAQ), com desempate pela ordem fixa de `NIVEL_BASE`, e repetidos são removidos. Assim a ordem devolvida pelo modelo não muda o resultado: `[rastreio, reacao_adversa]` e o inverso dão o mesmo resultado.
6. **Nível 2:** não há 2ª chamada nem resposta ao cliente. O resumo interno é montado em código (motivos, sinais, confiança, ação, razões do nível e `guiaInterno` de todos os motivos presentes).
7. **Níveis 0 e 1:** redação (2ª chamada) com as entradas de FAQ dos motivos e os fatos do pedido, depois `verificarResposta`. Se a checagem reprovar, a resposta vira o texto de reserva; no nível 0, o nível passa a 1 e `acaoSugerida` é chamada de novo com nível 1, para ação e autonomia coerentes. O resultado marca `fallback`, e `taxaFallback(resultados)` dá a métrica (fallbacks sobre conversas com redação).
8. **Orçamento total de 12 s.** Cada chamada usa o menor entre 8 s e o tempo restante; não se começa chamada com menos de 1,5 s. A nova tentativa (só para JSON inválido, nas duas chamadas) só ocorre se sobrar tempo.
9. **Falhas:** qualquer erro leva a nível 2, ação `escalar_atendimento_humano`, razão "falha interna: revisão humana" e `falha.tipo` (`timeout`, `rate_limit`, `json_invalido`, `config`, `requisicao_recusada`, `indisponivel`, ou `interno` para exceção fora do cliente do modelo, como o `RangeError` da policy). O erro original não é devolvido nem logado.
10. **Privacidade:** o resultado não contém a mensagem nem trechos dela (há teste nos caminhos de nível 0, nível 2, fallback e falha); a telemetria (`chamadas`) só traz tokens, `finish_reason`, latência e se o zod aceitou.

### Afirmações de ação já feita (31/10/2026)

Na primeira gravação, os rascunhos de nível 1 dos exemplos de atraso e de injeção diziam "já acionamos a transportadora" e "nossa equipe já abriu chamado com a transportadora", embora a ação ainda aguardasse aprovação. A checagem não pegava, porque os verbos não estavam em `PADROES_COMPROMISSO`. Correções:

- `PADROES_ACAO_FEITA` (em `checagem.ts`, sobre texto normalizado e com fronteiras de palavra) reprova, nos níveis 0 e 1, afirmações de ação cumprida em formas ativas e passivas: "já" seguido de verbo no passado (acionamos, abrimos/abriu, solicitamos, entramos em contato, reembolsamos, estornamos, enviamos, reenviamos, cancelamos, trocamos, providenciamos, registramos, encaminhamos, resolvemos e afins); verbos que só descrevem ação feita mesmo sem "já" (acionamos, providenciamos, estornamos, reembolsamos; abrimos/registramos um chamado); passivas como "foi aberto um chamado", "seu pedido já foi cancelado", "o reembolso foi feito". Falha nova: `acao_feita`. Os testes confirmam que os padrões não casam com o texto de reserva, com as entradas da FAQ, nem com frases no futuro ou pendentes ("uma pessoa da equipe vai analisar") ou com fatos do pedido ("seu pedido foi enviado e está em trânsito").
- O prompt de redação do nível 1 diz que a ação **ainda não foi feita** e aguarda aprovação, proíbe narrá-la como cumprida e pede o formato do texto de reserva. O prompt de nível 0 não traz essa instrução.
- Regravação (8 exemplos): todos com o nível e a ação esperados, checagens aprovadas, sem fallback e sem afirmação de ação feita. Os dois rascunhos de nível 1 passaram a reproduzir o texto de reserva.

### Nível 0 sem promessa de contato; nível 1 com o motivo (31/10/2026)

- **Prompt do nível 0:** a resposta só traz fatos do pedido e o texto das entradas de FAQ usadas; não diz o que a equipe está fazendo e não promete contato, retorno ou prazo. Se a resposta resolve a dúvida, encerra sem oferecer contato futuro (pode convidar a responder a mensagem). A regra comum "diga que a equipe analisa" saiu do prompt.
- **Checagem do nível 0** (`PADROES_PROMESSA_CONTATO`, falha `promessa_contato`): reprova "entraremos/entrará em contato", "vamos/vai entrar em contato, retornar, avisar, responder", "retornaremos", "daremos retorno", "voltaremos a falar", "avisaremos/avisamos", "em breve", "estamos/está acompanhando, verificando, analisando...", "verificaremos, analisaremos..." e "equipe ... vai/irá/analisará...". Vale **só no nível 0**: o texto de reserva ("uma pessoa da nossa equipe vai analisar o seu caso e responder por aqui") só é usado no nível 1, onde continua permitido. Há teste que passa cada entrada da FAQ de uso "cliente" por todas as checagens do nível 0.
- **Prompt do nível 1:** o rascunho cita o motivo do contato e, quando couber, pede desculpas pelo transtorno, no formato do texto de reserva, sem narrar a ação e sem datas ou prazos.
- **Regravação:** na primeira tentativa, os rascunhos de nível 1 ainda copiavam o texto de reserva palavra por palavra; o prompt passou a pedir para não copiar literalmente e a dar um exemplo para pedido atrasado. Uma tentativa intermediária parou por `rate_limit` do Groq (três gravações em poucos minutos) e, como previsto, não gravou nada. Resultado final: 8 de 8 com o nível e a ação esperados, sem fallback; os rascunhos de nível 1 citam o atraso e pedem desculpas, e as respostas de nível 0 encerram convidando a responder a mensagem, sem prometer contato.

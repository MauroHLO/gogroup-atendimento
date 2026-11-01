# Decisões de projeto: Agente de Atendimento (Gocase e GoBeauté)

Status: desenho aprovado, números preliminares. Os valores abaixo são estimativas feitas com um classificador por regras sobre a amostra do desafio (1 em cada 3 clientes). Serão revalidados em `analysis/`.

## 1. Objetivo e métricas

O agente existe para dar à liderança uma visão confiável de por que os clientes procuram o atendimento e para agir sobre cada conversa com o nível certo de autonomia.

Métricas principais:
1. **Precisa de humano ou não:** percentual de conversas por nível de autonomia.
2. **Contatos evitados:** conversas que não precisariam existir (aviso proativo, autoatendimento, correção de processo). Como o agente não rodou em produção, o painel e o README falam em contatos **potencialmente evitáveis (hipótese)**, nunca em contatos evitados medidos (seção 15).

Métrica associada (não central): R$ economizados por automação. O custo por conversa do `parametros.md` é por canal, não por quem atende, então não serve como prova direta de economia.

## 2. O que os dados mostram (preliminar)

- Custo estimado no período: ~R$ 108 mil (~12 mil conversas, amostra escalada ×3).
- Atraso e rastreio juntos: ~37% do custo (19,5% + 17,3%).
- Reclame Aqui: ~10% das conversas, ~47% do custo (R$ 42 por conversa).
- A tag manual e o classificador por regras divergem em 28,7% das conversas; parte é erro da tag e parte das regras (numa amostra estratificada por tag, 36% das tags não batem com nenhum motivo lido no texto; seção 16). Nos casos de reação adversa, a tag e as regras concordam em só 20%; parte é erro da tag e parte das regras. As 308 conversas sem tag estão todas entre as 459 que só têm a saudação do bot (um subconjunto, não o mesmo conjunto: as outras 151 conversas só com o bot têm tag). Conferido em 31/10/2026 com as funções de `analysis/analise_atendimento.py`.
- A tag divergente não mudou a resolução (62,4% com tag coerente contra 61,8% com divergente); o custo é de visibilidade para a liderança.
- 19% das conversas são a 2ª ou posterior do mesmo pedido (~R$ 28 mil, ~26% do custo).
- Reclame Aqui tende a ser fim de escalada: 36% das conversas do canal são recontato, contra 17% nos demais. Com ameaça de reclamação, a próxima conversa do pedido é no Reclame Aqui em 50% dos casos, contra 11% sem ameaça (só 34 casos com ameaça: indício, não prova).
- Rota Express aparece em 63% dos contatos de rastreio e atraso, contra ~20% na referência (~3,1×), concentrada no Nordeste: CE 3,5×, RN 4,7×, PB 5,5×, PE 2,3×, BA 1,8×. A base de comparação é aproximada.
- Em 72% das reclamações de atraso, o status do pedido ainda é "em trânsito".
- 40 conversas de reação adversa: nenhuma com tag própria, nenhuma cita registro ou lote, e em todas o agente humano ofereceu troca.
- ~30% dos contatos chegam fora das 8h às 20h, quando só o bot responde. No WhatsApp, a mediana da primeira resposta é de 12 min e ~20% estouram o SLA em horário comercial.

## 3. Taxonomia de motivos

Rastreio, atraso, item faltando, brinde, avaria, erro de personalização, cancelamento, endereço, cobrança/financeiro, pagamento pendente, promoção/cupom, troca ou devolução, fragrância, dúvida de produto, elogio e **reação adversa** (categoria nova, não existe na lista de tags atual). O app acrescenta dúvida de política e direitos do titular (ver seção 12). Cada motivo é mapeado para as 13 tags originais para comparação. Conversas podem ter mais de um motivo (8,5% das conversas da amostra; `metricas.json` → `resumo.pct_multi_intencao`).

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

Simulação preliminar (3.541 conversas com mensagem do cliente), com a FAQ de produto e promoção pendente: nível 0 ≈ 14,5%, nível 1 ≈ 57,1%, nível 2 ≈ 28,4% (valores depois do alinhamento do regex de saúde, seção 16; antes: 14,5%, 57,0%, 28,6%). O nível 2 concentra ~60% do custo por causa do Reclame Aqui. O efeito de preencher a FAQ pode ser simulado ajustando `FAQ_VALIDADA` no script.

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

**Cautelas operacionais e ambiguidades (revisão de 31/10/2026; nenhuma entrada mudou):**
- "Sujeito/sujeita à análise da equipe" (avaria e item faltante, personalização), "a solicitação é analisada pela nossa equipe antes de qualquer devolução" (arrependimento) e "a solicitação passa pela análise da equipe" (fragrância) são **cautelas operacionais, não política**: o agente não aprova troca, reenvio nem reembolso (essas ações são nível 1), então o texto não pode soar como aprovação. A política do desafio não descreve essa etapa de análise.
- "Avise-nos" (avaria e item faltante, personalização) também é cautela: indica o próprio atendimento, porque a política não diz por qual canal o cliente avisa.
- "Dentro de 30 dias" (troca por fragrância) não diz a partir de quando (compra ou recebimento). A ambiguidade é da própria política, e o texto apenas a repete, sem escolher um marco.
- A instrução interna de cobrança duplicada "não confirmar estorno ao cliente antes da verificação" também é cautela operacional; ela nunca vai ao cliente.
- O endereço deixou de dizer "por aqui": a entrada termina em "a alteração não é mais possível".
- **Ponto para a avaliação manual (seção 9):** no exemplo de endereço com pedido em trânsito, o modelo escreveu "não é possível alterar o endereço **agora**". O "agora" não vem da FAQ e sugere que a alteração seria possível depois; a checagem não pega esse tipo de sugestão.

## 8. Privacidade

- Mascarar CPF, telefone, e-mail e número de cartão antes de enviar texto ao modelo. O cartão não consta entre os dados que a empresa declara coletar, então é sempre removido.
- O agente nunca pede CPF, cartão ou senha no chat.
- A aplicação não guarda o texto das conversas: processa, devolve a decisão e descarta.
- Os dados brutos do desafio não ficam no repositório; só código e agregados.
- Toda decisão sai com justificativa registrada, para permitir revisão humana.

## 9. Avaliação

Não há rótulo verdadeiro. Plano: rotular à mão ~60 conversas e medir classificação e nível de autonomia contra elas, reportando acertos e erros, em vez de confiar só nas regras usadas na exploração. A primeira medida do classificador LLM e do nível, com a tag do agente e um rótulo de leitura feito por assistente de IA, está na seção 16; a revisão humana desses rótulos é parcial (22 dos 78 da amostra; seção 16), e os outros 56 não foram revisados por pessoa.

A avaliação manual também deve ler os textos redigidos em busca do que a checagem automática não pega: sugestões de exceção ou de prazo que a FAQ não traz, como o "agora" do exemplo de endereço (seção 7).

## 10. Limitações

- O classificador de exploração é por regras e aproximado.
- Faltam data de entrega, dados de pagamento, fotos e base de produtos.
- Os dados são sintéticos e textualmente repetitivos; o desempenho em texto real pode ser menor.
- A comparação por transportadora e UF usa uma base de referência aproximada.
- Os custos por conversa não distinguem bot de humano.

## 11. Pendências

- Preencher a FAQ de produto e promoções se houver fonte validada.
- Revisar por uma pessoa os 56 rótulos da amostra que faltam (revisão parcial na seção 16: 22 de 78; os rótulos são de um assistente de IA).
- Falta na taxonomia um motivo de troca por insatisfação (achado na revisão, seção 16): hoje cai em `troca_tamanho` ou `cancelamento`. Decidir se cria o motivo, com validação em amostra nova.
- Pedido parado em trânsito (seção 16): segue como limitação conhecida; próximo passo é uma regra no código, validada numa amostra nova.
- Calibrar o limiar de confiança (valor inicial 0,7) com a amostra rotulada.
- Alinhar o script Python à regra do app. Feito: `FAQ_VALIDADA` só vale para os motivos de FAQ, como no app, e o regex de saúde usa o mesmo padrão de "fórmula". Ainda diverge (ver seção 16): o classificador Python não tem `duvida_politica` nem `direitos_titular`, e os sinais do Python olham todas as mensagens do cliente na conversa, não uma mensagem só.

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
- O prompt de classificação não menciona nível, autonomia nem ação. O de redação recebe a decisão pronta (descrição da ação), as entradas de FAQ usadas e os fatos do pedido (status e canal; o valor saiu depois, ver abaixo), e proíbe números fora dessas informações, promessas e pedido de CPF, cartão ou senha.

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
7. **Níveis 0 e 1:** redação (2ª chamada) com as entradas de FAQ dos motivos e os fatos do pedido, depois `verificarResposta`. Se a checagem reprovar, a resposta vira o texto de reserva; no nível 0, o nível passa a 1 e `acaoSugerida` é chamada de novo com nível 1, para ação e autonomia coerentes. O resultado marca `fallback`, e `taxaFallback(resultados)` dá a métrica (fallbacks sobre conversas com redação). Desde 31/10/2026 há uma nova redação antes do texto de reserva (ver "Nível 0 mais enxuto, ressalvas temporais e nova tentativa de redação").
8. **Orçamento total de 12 s.** Cada chamada usa o menor entre 8 s e o tempo restante; não se começa chamada com menos de 1,5 s. A nova tentativa por JSON inválido (nas duas chamadas) e a nova redação após checagem reprovada só ocorrem se sobrar tempo.
9. **Falhas:** qualquer erro leva a nível 2, ação `escalar_atendimento_humano`, razão "falha interna: revisão humana" e `falha.tipo` (`timeout`, `rate_limit`, `json_invalido`, `config`, `requisicao_recusada`, `indisponivel`, ou `interno` para exceção fora do cliente do modelo, como o `RangeError` da policy). O erro original não é devolvido nem logado.
10. **Privacidade:** o resultado não contém a mensagem nem trechos dela (há teste nos caminhos de nível 0, nível 2, fallback e falha); a telemetria (`chamadas`) só traz tokens, `finish_reason`, latência e se o zod aceitou; `tentativasRedacao` conta as redações checadas.

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

### Valor do pedido fora da redação (31/10/2026)

O valor do pedido só serve ao código, para o escalonador de valor acima de R$ 200. Ele saiu dos fatos enviados ao prompt de redação (que agora traz só status e canal) e, com isso, da lista de números que a checagem aceita: uma resposta que cite o valor reprova como `numero_sem_fonte`. Motivo: na gravação anterior, a resposta de rastreio dizia "O valor total é R$ 89,90", o que não ajuda quem pergunta onde está o pedido. Regravação: 8 de 8 com o nível e a ação esperados, sem fallback.

### Termos de solução só se estiverem na FAQ usada (31/10/2026)

Teste ao vivo em produção: "Comprei uma capinha e veio o modelo errado." (entregue, WhatsApp) deu nível 1, `personalizacao_erro`, e o rascunho dizia "...para que possamos providenciar a reposição sem custo". A checagem aprovou, mas a FAQ usada fala em "nova produção é sem custo", não em reposição, e o rascunho prometia o desfecho. Correções:

- **Checagem `termo_de_solucao`** (níveis 0 e 1, `TERMOS_DE_SOLUCAO` em `checagem.ts`, sobre texto normalizado e com fronteiras de palavra): reposição/repor, troca/trocar, reembolso/reembolsar, estorno/estornar, devolução/devolver, desconto, cupom, "sem custo", "sem nenhum custo", gratuito/gratuita/grátis, "de graça" e providenciar só passam se o **mesmo termo** (a mesma família) aparecer nas entradas de FAQ usadas na redação. "Sem custo" e "sem nenhum custo" são termos diferentes de propósito. O particípio de trocar só conta depois de auxiliar ("será trocado"), porque a FAQ de personalização diz "iniciais trocados" no sentido de erro. Há teste que passa o texto de reserva e cada entrada da FAQ de uso "cliente" (como entrada usada, nos níveis 0 e 1).
- **Prompts de redação:** os dois níveis dizem para não prometer nem descrever solução, custo ou resultado que não esteja escrito na FAQ. O nível 1 permite pedir os dados necessários para a análise (por exemplo, fotos), sem prometer o desfecho.
- **`--gravar` resistente a rate limit** (só ferramenta de desenvolvimento; o app não muda): pausa de 10 s entre exemplos; em `rate_limit`, espera o `retry-after` do Groq (ou 20 s) e repete só aquele exemplo, até 3 vezes; imprime o texto de cada resultado assim que ele passa. Continua tudo ou nada. Duas tentativas anteriores pararam por `rate_limit` sem gravar; a versão nova gravou os 8 na primeira passada, sem fallback.

### Assunto do rascunho vem do código; canal fora dos fatos; prazos (31/10/2026)

Em 22 cenários testados ao vivo em produção, o exemplo de atraso que estava dentro do prompt do nível 1 vazava para rascunhos de outros motivos. Correções:

- **Assunto em código** (`assuntoDoContato` em `prompts.ts`): o motivo principal (e o status, no endereço) define a frase do assunto, por exemplo "o atraso do seu pedido", "a situação do seu pedido", "o seu pedido de cancelamento", "o problema com o seu pedido", "o erro na personalização". O prompt do nível 1 recebe só essa frase, sem exemplo literal, sem o texto de reserva e sem a descrição da ação (que fala em reposição, troca, devolução). O pedido de desculpas só vale para motivos que são problema do pedido (atraso, avaria, item faltando, brinde, erro de personalização). No **endereço em separação**, o rascunho não cita a regra: a FAQ não vai ao prompt, e o texto só diz que a equipe vai verificar se a alteração ainda é possível.
- **Motivo não identificado** (`nao_classificado` como motivo principal): não há redação; a resposta é o texto de reserva, com nível 1 e ação `preparar_triagem`. Uma chamada ao modelo só. Não conta na taxa de fallback (não houve redação).
- **Fatos do pedido na redação:** só o status. O canal saiu (serve à regra, não à resposta).
- **Prazos na checagem `termo_de_solucao`:** amanhã, hoje, depois de amanhã, nesta semana, próxima semana, dias da semana, "até o fim do dia", "nas próximas horas" e "ainda hoje" só passam se estiverem nas entradas de FAQ usadas. O texto de reserva e todas as entradas de FAQ do cliente continuam passando (há teste).

### Assunto do rascunho de rastreio depende do status (31/10/2026)

Com os motivos [rastreio, atraso], o desempate põe rastreio como principal, e o rascunho saía "Seu pedido está com status atrasado", sem pedido de desculpas. A ordem dos motivos não muda; muda o assunto:

- **Rastreio por status:** atrasado → "o atraso do seu pedido" (com pedido de desculpas); aguardando pagamento → "o pagamento do seu pedido"; em separação → "a preparação do seu pedido"; em trânsito e entregue → "a situação do seu pedido". O pedido de desculpas acompanha o assunto: só quando ele é um problema (atraso, avaria, item faltando, brinde, erro de personalização).
- **Sem a palavra "status" no prompt do nível 1:** o fato do pedido passou a se chamar "Situação do pedido" (vale para os dois níveis), e há teste de que o prompt do nível 1 não contém "status" em nenhuma combinação de motivo e status.
- **Tom:** o rascunho termina com a frase do texto de reserva ("Uma pessoa da nossa equipe vai analisar o seu caso e responder por aqui."), com tom natural e curto, evitando formas formais como "analisará" e "responderá".

### Nível 0 mais enxuto, ressalvas temporais e nova tentativa de redação (31/10/2026)

Na gravação anterior, a resposta de endereço em trânsito repetia a situação do pedido depois da regra da FAQ e terminava com "não é possível alterar o endereço agora", o que sugere que depois será possível; o rascunho de atraso pedia desculpas duas vezes. Correções:

- **Prompt do nível 0:** no máximo 3 frases; não repetir a situação do pedido quando o texto da FAQ já responde; sem "agora", "por enquanto", "no momento", "atualmente". A regra geral do prompt de redação passou de 4 para 3 frases. **Prompt do nível 1:** um único pedido de desculpas.
- **Checagem:** ressalvas temporais (agora, por enquanto, no momento, atualmente, "por ora") entram em `TERMOS_DE_SOLUCAO` (falha `termo_de_solucao`): só passam se estiverem nas entradas de FAQ usadas. O texto de reserva e todas as entradas de FAQ do cliente continuam passando (há teste).
- **Nova tentativa de redação:** se a checagem reprovar, o pipeline faz **uma** nova redação com a mesma entrada (mesmo prompt), se ainda houver pelo menos 1,5 s no orçamento. Se a 2ª passar, não há fallback (e o nível 0 continua 0). Se reprovar de novo, vale o texto de reserva, e o nível 0 passa a 1. Se a nova tentativa não puder ser feita (sem tempo, falha do provedor ou JSON inválido), vale a primeira checagem: texto de reserva, sem ir a nível 2. O prompt da 2ª tentativa é o da 1ª, sem mudança, mais uma linha no fim com o **tipo** da reprovação em linguagem simples (por exemplo, "A resposta anterior foi recusada por conter ressalva temporal; reescreva sem isso, seguindo as mesmas regras."), sem repetir o texto recusado; no `termo_de_solucao`, o tipo é a categoria (solução/custo, prazo ou ressalva temporal). Assim, mesmo com temperatura 0, a 2ª redação não recebe exatamente a mesma entrada. O prompt da 1ª tentativa não mudou (os hashes das gravações continuam iguais).
- **Telemetria:** o resultado traz `tentativasRedacao` (0 sem redação, 1 ou 2), que também entra na linha de log da rota.
- **Sem "status" nos prompts de redação:** a descrição da ação de rastreio no nível 0 passou a "Informar ao cliente a situação do pedido em trânsito."; há teste de que nem o nível 0 nem o nível 1 contêm "status" em nenhuma combinação alcançável de motivo e status.

## 15. Rota, demonstração e painel de impacto (parte 4)

### Rota `api/agent` (`app/src/app/api/agent/route.ts` e `app/src/lib/rota/handler.ts`)

- O arquivo da rota só exporta `maxDuration = 20` e `POST`. A lógica fica em `criarHandler(deps)`, com cliente do modelo, limites, relógio, log e contingência injetáveis para os testes. Com `cacheComponents: true`, o Next 16 recusa no build as exportações `dynamic` e `runtime`, então elas não existem.
- **Ordem das verificações:** mesma origem (403) → tamanho do corpo, até 10 KB, lido com teto mesmo sem `Content-Length` (413) → zod: mensagem de até 2.000 caracteres, status, canal, valor de 0 a 10.000 e nº do contato de 1 a 20 (400) → limites (429) → pipeline.
- **Mesma origem:** `Origin` precisa bater com o host (`x-forwarded-host` ou `host`), e `sec-fetch-site`, quando vem, precisa ser `same-origin`. Não é autenticação: só impede que outro site use a rota pelo navegador de um visitante.
- **Exceção na rota:** responde 200 no formato do pipeline, com nível 2, `falha.tipo: "interno"` e a razão "falha interna: revisão humana". O erro original não é devolvido nem logado.
- **Log:** uma linha por requisição, `{nivel, falha, ms, chamadas, tentativasRedacao}`. Sem IP, mensagem nem erro.

### Limites (`app/src/lib/limites`)

- Janela fixa em memória, sem serviço externo: por IP, 10 por minuto e 100 por dia; teto global diário `LIMITE_DIARIO_GLOBAL` (padrão 300). O dia vira à meia-noite de Brasília. Todos os limitadores são verificados antes de consumir qualquer um, então quem é barrado não gasta a cota dos outros.
- **Os limites são parciais em serverless:** cada instância tem o próprio contador, e um reinício o zera. Servem para conter abuso casual e custo, não como garantia. Um contador compartilhado (Redis ou similar) fica para produção.
- IP: `x-real-ip`, depois `x-vercel-forwarded-for` (os dois definidos pela Vercel) e, por último, `x-forwarded-for`.

### Contingência com respostas gravadas (`app/src/lib/demo/contingencia.ts`)

- As saídas do modelo para os 8 exemplos prontos ficam em `gravados.json`, gravadas com `npm run smoke -- --gravar`. Na reprodução, o pipeline real roda com essas saídas: nível, ação e checagens são calculados na hora pelo código.
- **Quando entra:** 429 da rota (`ip_minuto`, `ip_dia` ou `diario`) ou falha do modelo (`timeout`, `rate_limit`, `indisponivel`, `config`, `requisicao_recusada`, `json_invalido`), incluindo a classificação inválida mesmo após nova tentativa. Só vale para a mensagem e o contexto **exatos** de um exemplo pronto. Não consome cota nem chama o Groq.
- A interface mostra uma faixa "Resposta gravada" com o motivo real e a data da gravação.
- A gravação guarda um hash dos prompts. Se um prompt mudar sem regravar, o teste falha e diz como regravar. Um arquivo inválido desliga a contingência, sem derrubar a rota.

### Interface (`app/src/app`)

- `page.tsx` traz o problema, a regra, a demo e o aviso de dados fictícios: a mensagem é mascarada e processada pelo Groq, sem ser guardada pela aplicação, e a hospedagem registra IP e caminho, não o conteúdo.
- `Demo.tsx` (cliente) traz os 8 exemplos e o contexto simulado do pedido. `Resultado.tsx` mostra o nível com cor, símbolo e texto, as razões, a ação, a resposta ou o resumo interno, as checagens, a telemetria e "O que o modelo viu" (a mensagem mascarada e delimitada, calculada no navegador, porque a API não a devolve).
- Páginas com `noindex`; tema claro; movimento reduzido respeitado.

### Painel de impacto (`app/src/lib/impacto` e `Impacto.tsx`)

- Os números vêm de `data/processed/` (`metricas.json` e os CSVs gerados por `analysis/analise_atendimento.py`), copiados para `dados.ts` com arquivo e chave de origem. O teste compara cada número com o arquivo, quando ele existe, e confere as somas (níveis = 3.541 conversas com mensagem do cliente; grupos = 4.000; canais = custo estimado).
- Cada número é rotulado: "na amostra", "estimado para a população" (todo valor em R$), "hipótese" ou "associação, não causa". O texto não diz "no período de 90 dias": o período não está nos agregados, então fala em "no período da amostra".
- "Contatos evitados" não foi medido. O painel mostra contatos **potencialmente evitáveis (hipótese)**, pelos grupos de motivo do script, mais o recontato e o atraso com pedido em trânsito. O custo dos recontatos aparece só como associação.
- A simulação de autonomia traz o aviso de que usa o classificador por regras do script Python, não o LLM. A leitura: o nível 0 cobre 14,5% das conversas, mas só 8,2% do custo; o valor está em preparar o nível 1 (31,8% do custo) e priorizar o nível 2 (60,0%, com humano).
- O bloco do problema inclui Rota Express (3,08×, rotulado como associação, não causa), o estouro de SLA no WhatsApp (20,3%) e o recontato no Reclame Aqui (36,1% contra 17,1% nos demais canais). "Dados sintéticos" vem do dicionário de dados do desafio.

### Deploy na Vercel

- Raiz do projeto: `app/`.
- Variáveis: `GROQ_API_KEY` (marcada como Sensitive), `GROQ_MODEL` (opcional; padrão `openai/gpt-oss-20b`) e `LIMITE_DIARIO_GLOBAL` (opcional; padrão 300).
- **Variável nova ou alterada só vale depois de um Redeploy.**
- Sem chave, a rota responde com falha `config` em nível 2, e os exemplos prontos usam a contingência.

## 16. Avaliação do classificador (01/11/2026)

Mede a classificação do LLM de produção (Groq `openai/gpt-oss-20b`, mesmo prompt e mesmo mascaramento de PII) e o nível final que o código decidiria com ela. Só a etapa de classificação: a redação e a checagem não entram, então o nível 0 que cairia para 1 por fallback não aparece aqui. Nada de prompt, regra ou escalador foi alterado com base nesta amostra.

### Método

- **Scripts:** `analysis/avaliacao_classificador.py` (amostra, classificador de regras e métricas) e `app/scripts/avaliar-classificador.ts` (`npm run avaliar-classificador`: chama o Groq, pausa de 8 s entre chamadas, espera o retry-after em `rate_limit`, retoma de onde parou). Os agregados ficam em `data/processed/avaliacao_*.csv` e `avaliacao_classificador.json`, sem texto de mensagem. Os arquivos por mensagem (entrada, saída do modelo, rótulos, detalhe) ficam em `data/interim/avaliacao/`, fora do Git.
- **Amostra:** conversas com mensagem de abertura do cliente e tag, estratificadas pela tag do agente, 6 por tag, seed 20261101. Dentro de cada tag ficou uma conversa por texto mascarado, porque os dados sintéticos repetem modelos de frase. São 13 tags (incluindo "Outros"), todas com pelo menos 92 textos únicos, e a amostra tem 78 conversas. A estratificação é por tag, não pelos 19 motivos do app, porque a tag é a única referência que o dataset traz.
- **Referência 1, tag do agente:** é a coluna `tag_agente` de `conversas.csv`, a categoria que o agente atribuiu ao encerrar a conversa. São 12 categorias mais "Outros", mais grossas que os motivos. Um acerto contra a tag significa que o motivo previsto é coerente com ela (`TAG_ESPERADA` do `analise_atendimento.py`, estendida com `duvida_politica`, `direitos_titular` e `nao_classificado`). "Outros" fica fora dessa conta.
- **Referência 2, rótulo de leitura:** motivos, tópico e sinais de cada uma das 78 mensagens, atribuídos lendo o texto antes de rodar o LLM. **O anotador foi o assistente de IA que conduziu a avaliação, não uma pessoa, e foi um anotador só.** A revisão humana foi parcial (22 de 78; ver "Revisão humana parcial"). Ele é necessário porque a tag não define o nível: Financeiro pode ser cobrança (nível 2) ou pagamento pendente (nível 0). 9 das 78 mensagens foram marcadas como ambíguas.
- **Nível:** previsto e de referência saem do mesmo código (`ordenarMotivos`, `faqParaConsulta`, `decidirNivel`) e do mesmo contexto do pedido (status, canal, valor, nº do contato). O previsto usa os motivos, o tópico, a confiança e os sinais do modelo, combinados por "ou" com as palavras-chave do app. A referência usa o rótulo de leitura, com confiança 1.
- **Sinais:** usam todas as mensagens de cliente do dataset (em qualquer posição da conversa) que casam com `RE_SAUDE` ou `RE_AMEACA` do script Python. Há uma chamada por texto único e o resultado é ponderado pelas repetições. As mensagens de saúde também foram lidas, para separar os falsos positivos do regex.
- **Execução:** 141 chamadas, sem nenhum `rate_limit`. 1 classificação saiu inválida mesmo após a nova tentativa e virou `nao_classificado` com confiança 0, logo nível 2. Era uma mensagem com dois assuntos, saúde e atraso, que já iria a nível 2 pelo sinal de saúde.

### Números

| Medida | LLM | Regras (Python) |
| --- | --- | --- |
| Motivo principal coerente com a tag (72, sem "Outros") | 54,2% (IC 95%: 42,7–65,2) | 65,3% (53,8–75,2) |
| Algum motivo coerente com a tag | 62,5% | 65,3% |
| Só nas 46 em que a tag bate com a leitura | 84,8% (71,8–92,4) | 100% (92,3–100) |
| Motivo principal igual ao rótulo de leitura (78) | 91,0% (82,6–95,6) | 85,9% (76,5–91,9) |
| Algum motivo igual ao principal da leitura | 91,0% | 94,9% |

- **A tag do agente é uma referência ruim.** Em 26 das 72 conversas (36%), nenhum motivo lido no texto é coerente com a tag. Os casos piores são Promoção (0 de 6), Cancelamento (1 de 6) e Elogio (1 de 6). Por isso o acerto contra a tag fica baixo para os dois classificadores, e não dá para usá-lo como medida de qualidade.
- **As regras não são uma comparação independente.** Elas foram escritas olhando estes mesmos dados sintéticos, cheios de frases-modelo, e o 100% nas tags coerentes reflete isso. Contra o rótulo de leitura, LLM e regras acertam juntos 63 de 78. Só o LLM acerta 8, só as regras acertam 4, e nenhum dos dois acerta 3.
- **Por motivo,** as classes têm de 1 a 15 mensagens (`avaliacao_por_motivo.csv`), e os intervalos de confiança vão de largos a inúteis. Exemplos: rastreio 15 de 15 (IC 80–100%), atraso 11 de 13 (58–96%), avaria 8 de 10 (49–94%). Vários motivos têm só 1 ou 2 mensagens. **A amostra é pequena por classe; os números por motivo não sustentam conclusão.**
- **Os 7 desencontros do LLM contra a leitura:**
  - 2 são erros claros do modelo: um pedido de troca classificado como dúvida de produto, e uma pergunta sobre a resistência de uma capinha classificada como não identificada. Os dois ficam no mesmo nível.
  - 2 são queixas de pedido sem movimentação há dias: o modelo deu rastreio, a leitura deu atraso.
  - 2 são capinhas com defeito de impressão e riscos: o modelo deu só personalização, a leitura deu avaria e personalização.
  - 1 é uma pergunta sobre como devolver um produto: o modelo deu cancelamento, a leitura deu dúvida de política.
  - Os 5 últimos (rastreio/atraso, defeito, devolução) foram marcados como ambíguos antes da execução.

### Nível: subescalada e sobrescalada

| Nível de referência → previsto | 0 | 1 | 2 |
| --- | --- | --- | --- |
| 0 | 6 | 1 | 0 |
| 1 | 1 | 49 | 0 |
| 2 | 0 | 0 | 21 |

- **Igual em 76 de 78.**
- **Abaixo do correto: 1 (1,3%; IC 0,2–6,9%), de 1 para 0.** É uma queixa de pedido sem movimentação há dias, com status em trânsito: o modelo deu rastreio, e o código responderia sozinho com o status do pedido em vez de preparar o caso para aprovação. É o erro perigoso da lista, ainda que de baixo impacto, porque não envolve saúde nem dinheiro.
- **Acima do correto: 1 (1,3%), de 0 para 1.** É a pergunta sobre devolução: o modelo deu cancelamento sem tópico, então a resposta seria preparada para aprovação em vez de sair direto pela FAQ de arrependimento. Custa mais operação, mas não traz risco.
- **Os 21 casos de nível 2 de referência ficaram em 2.** Só 7 deles dependem do motivo (5 de cobrança e 2 de reação adversa). Os demais vêm de escaladores de contexto (Reclame Aqui, 3º contato, sinal de saúde), que não dependem do classificador.

### Sinais de saúde e ameaça (dataset inteiro)

| Sinal | Referência | Modelo sozinho | Pipeline (modelo ou palavra-chave) |
| --- | --- | --- | --- |
| Saúde | regex Python: 62 textos únicos (70 mensagens) | 82,3% dos textos (71,0–89,8); 74,3% das mensagens | 100% |
| Saúde | leitura: 53 textos verdadeiros (61 mensagens) | 96,2% dos textos (87,2–99,0); 85,2% das mensagens | 100% |
| Ameaça | regex Python: 1 texto único (161 mensagens) | 0 de 1 | 1 de 1 |

- **O modelo deixou passar 2 textos de saúde,** e as palavras-chave do app pegaram os dois. O primeiro é uma pergunta preocupada sobre o que tem na fórmula de um produto, que se repete 8 vezes no dataset; por isso o recall por mensagem cai para 85%. O segundo é uma pergunta sobre uso na gravidez junto com uma queixa de atraso, e é a mesma mensagem que deu classificação inválida.
- **Defeito encontrado (corrigido em seguida; ver "Correção do regex de saúde" abaixo):** 9 das 62 mensagens que o regex marca como saúde não falam de saúde. São mensagens sobre produtos cujo nome começa com a palavra fórmula, em pedidos de rastreio, de troca ou de devolução e em frascos quebrados. O modelo não marcou saúde em nenhuma delas. Mas o regex do app (`\bformulas?\b` em `sinais.ts`) marcou as 9, e o pipeline mandaria todas ao nível 2. É sobrescalada causada pelo código, não pelo modelo.
- **Ameaça:** o dataset tem um único texto de ameaça, que se repete 161 vezes (o cliente anuncia que vai abrir uma reclamação) e nunca aparece na mensagem de abertura. O modelo não o marcou como ameaça; o pipeline só o pega pela palavra-chave. Com um texto só, não dá para medir o recall do modelo para ameaça.

### Revisão humana parcial (01/11/2026)

**Escopo.** Revisão humana **parcial**, feita por Mauro, que discutiu os casos com um assistente de IA. Cobriu 24 itens: os 9 desencontros (7 da amostra e 2 textos de saúde que o modelo não marcou), mais 15 mensagens sorteadas com seed 20261102 entre as outras 71 da amostra. Desses 24, 23 confirmaram o rótulo e 1 ficou ambíguo; nenhum rótulo foi derrubado.

**Alcance.** A revisão cobriu **22 dos 78 rótulos da amostra (28,2%)**: 7 desencontros e 15 sorteados, todos confirmados. Os 2 itens restantes pertencem ao conjunto de saúde, e o ambíguo é um deles. **Os demais 56 rótulos da amostra não foram revisados por pessoa.** Quem revisou via o rótulo e a previsão do modelo, então isto é uma confirmação, não uma segunda rotulagem independente, e não permite medir concordância entre anotadores.

**Efeito nos números: nenhum.** `rotulos.csv` não mudou. As métricas foram recalculadas sem chamar o modelo (`npm run avaliar-classificador -- --recalcular` e `python analysis/avaliacao_classificador.py metricas`), e todos os valores anteriores de `avaliacao_classificador.json` ficaram iguais. O arquivo só ganhou o bloco `revisao_humana`, com as contagens acima. O texto ambíguo continua contado como saúde, por decisão de projeto de errar para o lado seguro.

| Medida | Antes | Depois |
| --- | --- | --- |
| Motivo principal igual ao rótulo de leitura (78) | 91,0% | 91,0% |
| Nível na amostra (78) | igual 76, abaixo 1, acima 1 | igual 76, abaixo 1, acima 1 |
| Recall de saúde pela leitura, modelo sozinho (53 textos) | 96,2% | 96,2% |
| Recall de saúde pela leitura, pipeline (53 textos) | 100% | 100% |

**Lacunas achadas na revisão:**

- **A taxonomia não tem motivo de troca por insatisfação.** Hoje esse pedido cai em `troca_tamanho` ou `cancelamento`. Nada foi alterado; a decisão está nas pendências (seção 11).
- **O pedido parado em trânsito segue como limitação conhecida** (ver Limitações). A revisão confirmou o rótulo atraso nesses casos; a regra no código continua sem ser feita.

### Limitações

- **Amostra pequena:** 78 conversas, 6 por tag e de 1 a 15 por motivo. Os intervalos de confiança são largos, e uma mensagem muda vários pontos percentuais.
- **Dados sintéticos e repetitivos:** o desempenho em texto real pode ser diferente, provavelmente pior para as regras.
- **Referência fraca:** a tag do agente é ruidosa, e o rótulo de leitura foi feito por um assistente de IA, um anotador só, com revisão humana parcial. **Dos 78 rótulos da amostra, 56 não foram revisados por pessoa.**
- **Escopo:** só a classificação. Fallback de redação, checagem e falhas do provedor não entram. Houve uma execução, com temperatura 0.
- **Limitação conhecida, pedido parado com status em trânsito:** uma queixa de pedido sem movimentação há dias pode ser classificada como rastreio. Com status em trânsito, rastreio é nível 0, e foi a única subescalada da amostra (1 → 0).
  - *Mitigação atual:* no nível 0, a resposta só pode conter os fatos do pedido e o texto da FAQ, sem prometer contato, retorno ou prazo (`INSTRUCAO_NIVEL_0` e as checagens `promessa_contato` e `termo_de_solucao`). O pior caso é informar o status sem tratar a demora, não prometer algo.
  - *Decisão:* o prompt de classificação não foi alterado.
  - *Próximo passo:* uma regra no código (por exemplo, em trânsito com sinal de demora no texto passa a nível 1), validada numa amostra nova, diferente desta.
- **Limitação do conjunto de saúde:** ele foi montado a partir do regex do script Python (`RE_SAUDE`), então só contém mensagens que esse regex encontra.
  - O recall medido não enxerga mensagens de saúde que o regex não pega (outra forma de descrever sintoma, por exemplo), e por isso tende a superestimar o recall real.
  - Não foi possível medir os falsos negativos do regex nem do pipeline fora desse conjunto.
  - O regex do Python e o do app não são iguais: o do Python pega "queimação", o do app não, e o modelo marcou essas mensagens.
- **Regra do Python ainda não alinhada à do app:** duas diferenças afetam a simulação de autonomia do painel.
  - O classificador por regras não tem `duvida_politica` nem `direitos_titular`, que no app vão a nível 0 com a FAQ. Alinhar exigiria regras novas de classificação e mudaria os números por motivo, então não foi feito.
  - Os sinais de saúde e ameaça do Python olham todas as mensagens do cliente na conversa; o app olha uma mensagem. Os dois regex também diferem em detalhes de fronteira de palavra e contexto (listados em `sinais.ts`).
  - Já alinhado: o padrão de "fórmula", "queimação" e `FAQ_VALIDADA` restrito aos motivos de FAQ.
- **Amostra comprometida:** esta amostra não pode ser usada para ajustar prompt, regras ou palavras-chave. Se algum defeito acima for corrigido, a medida de antes e depois fica registrada aqui, e esta amostra passa a ser declarada não independente.

### Correções propostas (não aplicadas; dependem de decisão)

1. **Regex de saúde do app:** aplicada (ver abaixo).
2. **Pedido sem movimentação com status em trânsito:** o prompt não será alterado. Fica registrado como limitação conhecida (ver Limitações), e o próximo passo é uma regra no código, validada numa amostra nova.

### Correção do regex de saúde (01/11/2026)

- **Mudança:** em `sinais.ts`, `\bformulas?\b` passou a `\b(na|da|a|nas|das|as)\s+formulas?\b`, sobre texto normalizado (minúsculas, sem acento), como os outros padrões. Os plurais entraram para manter o caso "as fórmulas" que já tinha teste.
- **Por quê:** nos nomes de produto, a palavra fórmula vem depois de artigo masculino; na pergunta sobre ingredientes, vem depois de artigo feminino.
- **Testes:** frases sintéticas no molde dos 9 falsos positivos, com produtos inventados, não marcam saúde; "na fórmula", "da fórmula", "a fórmula" e "as fórmulas" continuam marcando.
- **Resíduo conhecido:** um nome de produto precedido de artigo feminino ("comprei a Fórmula ...", "a tampa da Fórmula ...") ainda marca saúde. Há teste que documenta isso.
- **Sem efeito na demo:** o prompt não muda (os hashes das gravações continuam iguais), e os 8 exemplos prontos não citam fórmula.
- **Antes e depois, no mesmo conjunto da avaliação.** O conjunto é o mesmo usado para achar o defeito, então **não é independente**. A saída do modelo não mudou; só as palavras-chave foram recalculadas (`npm run avaliar-classificador -- --recalcular`, sem chamar o modelo).

| Medida | Antes | Depois |
| --- | --- | --- |
| Falsos positivos do regex (9 textos) marcados como saúde pelo pipeline | 9 (todos em nível 2) | 0 (6 em nível 1, 2 em nível 2 por outros escaladores, 1 em nível 0) |
| Recall do pipeline, saúde pela leitura (53 textos / 61 mensagens) | 100% / 100% | 100% / 100% |
| Recall do pipeline, saúde pelo regex Python (62 textos / 70 mensagens) | 100% / 100% | 85,5% / 87,1% (a queda são justamente os 9 falsos positivos) |
| Recall do modelo sozinho, saúde pela leitura | 96,2% dos textos | 96,2% (sem mudança) |
| Nível na amostra (78) | igual 76, abaixo 1, acima 1 | igual 76, abaixo 1, acima 1 |

Os 53 textos verdadeiros de saúde continuam em nível 2.

**Alinhamento do Python (01/11/2026).** O `RE_SAUDE` do `analise_atendimento.py` passou a usar o mesmo padrão de "fórmula" do app, e o app ganhou "queimação", que o Python já pegava. A simulação de autonomia foi refeita, e 7 conversas mudaram de nível:

| Nível | Conversas (antes → depois) | % das conversas | % do custo |
| --- | --- | --- | --- |
| 0 | 513 → 514 | 14,5% → 14,5% | 8,1% → 8,2% |
| 1 | 2.017 → 2.023 | 57,0% → 57,1% | 31,7% → 31,8% |
| 2 | 1.011 → 1.004 | 28,6% → 28,4% | 60,1% → 60,0% |

O conjunto de saúde desta avaliação foi montado com o regex anterior, que fica congelado em `avaliacao_classificador.py` (`RE_SAUDE_AVALIACAO`) para a etapa `amostra` continuar reproduzível.

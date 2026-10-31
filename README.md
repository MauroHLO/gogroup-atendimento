# Agente de atendimento: Gocase e GoBeauté

Agente que lê cada conversa de atendimento, identifica o motivo real e decide, por uma regra em código, se resolve sozinho, se prepara a ação para uma pessoa aprovar ou se passa o caso a um humano. Desafio AI-First do GoGroup, Problema 1.

**Demo pública (sem login):** https://gogroup-atendimento.vercel.app

> Os dados do desafio são sintéticos, e os exemplos da demo e dos testes foram escritos por nós. Não digite dados reais na demo.

## Como testar em 2 minutos

1. Escolha o exemplo **"Onde está meu pedido?"**: dá **nível 0**, e o agente responde com o status do pedido.
2. No mesmo exemplo, mude o status para **atrasado**: sobe para **nível 1** (o agente prepara a ação e aguarda aprovação). Volte o status e ponha **3º contato**: vai para **nível 2** (humano obrigatório).
3. **"Reação adversa"** dá sempre **nível 2**. Não há resposta ao cliente, só um resumo interno para a responsável técnica.
4. **"Injeção de instrução"**: a mensagem tenta mandar o modelo aprovar um reembolso. O nível continua sendo o do atraso (1), e "O que o modelo viu" mostra a mensagem mascarada entre delimitadores.
5. Abaixo da demo, o **painel de impacto** traz os números da análise, com a fonte de cada um.

## O problema em números

Análise de 4.000 conversas, numa amostra de 1 em cada 3 clientes, no período da amostra (`analysis/analise_atendimento.py`). Contagens e percentuais de conversas são da amostra; valores em R$ são estimativas para a população (amostra × 3).

| Número | O que é | Tipo |
|---|---|---|
| ≈ 12.000 | conversas no período da amostra | estimado |
| R$ 108.299 | custo de atendimento no período | estimado |
| 47,4% do custo | vem do Reclame Aqui, que tem 10,2% das conversas | custo estimado; conversas na amostra |
| 36,8% do custo | atraso (19,5%) e rastreio (17,3%) | estimado |
| 20,3% | das conversas de WhatsApp com resposta do atendente passam do SLA de 30 min (contado das 8h às 20h) | na amostra |
| 30,3% | das conversas abertas fora das 8h às 20h | na amostra |
| 3,08× | Rota Express está em 62,8% dos contatos de rastreio e atraso, contra 20,4% dos pedidos dos demais contatos | associação, não causa |

Recontato no Reclame Aqui: 36,1% das conversas do canal são o 2º contato ou mais sobre o mesmo pedido, contra 17,1% nos demais canais.

**Contatos potencialmente evitáveis (hipótese).** O agente não rodou em produção, então nada aqui é contato evitado medido:
- 1.445 conversas (36,1%) de **falha de processo** (atraso, avaria, item faltando, brinde, erro de personalização), evitáveis corrigindo a causa;
- 1.496 (37,4%) caberiam em **comunicação proativa ou autoatendimento** (rastreio, pagamento pendente, cancelamento, endereço, promoção, dúvida de produto);
- 19,1% das conversas são o 2º contato ou mais sobre o mesmo pedido;
- 72% das reclamações de atraso chegam com o pedido ainda em trânsito.

Os recontatos somam R$ 28.343 do custo estimado. É uma associação, não uma economia garantida.

**Como defendemos as conclusões:**
- base validada: 4.000 conversas, 14.559 mensagens, 3.237 pedidos, nenhuma duplicada;
- a tag manual do atendente bate com o motivo inferido em 71,3% das conversas: divergência de até 28,7%, um teto;
- nas 40 conversas de reação adversa, a tag concorda em 20%, nenhuma tem tag própria, o atendente oferece troca em todas e nenhuma cita registro ou lote;
- 174 mensagens de clientes têm CPF, 91 telefone e 45 cartão (de 5.684), o que justifica o mascaramento.

Origem de cada número: `data/processed/metricas.json` e os CSVs da mesma pasta. O painel mostra o arquivo e a chave, e `app/src/lib/impacto/impacto.test.ts` confere cada número com o arquivo.

## Níveis de autonomia

| Nível | O agente… | Exemplos |
|---|---|---|
| **0: executa** | responde sozinho, só com fatos do pedido e texto da FAQ | rastreio de pedido em trânsito, pagamento pendente, elogio, dúvida de política com entrada na FAQ, recusa explicada de mudança de endereço com o pedido já em trânsito |
| **1: prepara e aguarda aprovação** | propõe a ação e um rascunho; uma pessoa aprova | atraso, avaria, item faltando, brinde, erro de personalização, cancelamento, troca, arrependimento, dúvida de produto ou cupom sem FAQ validada |
| **2: humano obrigatório** | só resume e prioriza; não responde ao cliente | reação adversa (sempre), cobrança duplicada, qualquer assunto de saúde, ameaça jurídica ou de reclamação pública |

**Escalonadores (só sobem o nível):** canal Reclame Aqui → 2; 2º contato no pedido → pelo menos 1, 3º contato → 2; pedido acima de R$ 200 → pelo menos 1; confiança baixa → sobe um nível; vários motivos → vale o mais restritivo.

**Simulação nos dados** (3.541 conversas com mensagem do cliente; FAQ de produto e promoções pendente):

| Nível | Conversas | % das conversas | % do custo |
|---|---|---|---|
| 0 | 513 | 14,5% | 8,1% |
| 1 | 2.017 | 57,0% | 31,7% |
| 2 | 1.011 | 28,6% | 60,1% |

O nível 0 cobre 14,5% das conversas, mas só 8,1% do custo. O valor está em preparar o nível 1 (31,7% do custo) e priorizar o nível 2 (60,1% do custo, com humano). A simulação usa o classificador por regras do script Python, não o LLM do agente.

## Arquitetura

**O LLM entende e redige; o código decide.**

```
mensagem → mascarar dados pessoais → classificar (LLM, JSON validado) → sinais de saúde e ameaça (LLM ou palavras-chave)
        → FAQ → nível (regra em código) → ação (tabela em código) → redigir (LLM, só níveis 0 e 1) → checar o texto
```

| Módulo (`app/src/lib/`) | Papel |
|---|---|
| `pii` | mascara CPF, telefone, e-mail e cartão antes de qualquer chamada ao modelo |
| `policy` | regra de autonomia determinística (`decidirNivel`) |
| `acoes` | ação sugerida por motivo e nível, com trava: nunca mais autonomia do que a regra permite |
| `faq` | camada de política (paráfrases da política do desafio e da Central de Privacidade) e camada de produto e promoções, pendente |
| `agent` | prompts, cliente do Groq com saída JSON em modo estrito, checagem do texto e `processarConversa` |
| `limites`, `rota` | limite de requisições e a rota `api/agent` |
| `demo`, `impacto` | exemplos, respostas gravadas e números do painel |

Modelo padrão: `openai/gpt-oss-20b` no Groq, com temperatura 0. Uma conversa faz 1 chamada (nível 2) ou 2 (níveis 0 e 1), mais uma nova tentativa se o JSON vier inválido, e levou de 0,5 s a 1,3 s nas medições do smoke test.

## Segurança e privacidade

- **Mascaramento** antes do modelo. A aplicação não guarda a mensagem, e o log tem uma linha por requisição só com métricas (nível, falha, tempo, nº de chamadas), sem IP nem texto.
- **Checagem do texto redigido.** Reprova números, prazos e links que não estejam na FAQ ou no pedido; promessas (garantimos, vamos reembolsar); ação narrada como já feita (já acionamos, foi aberto um chamado); promessa de contato no nível 0; e menção a CPF, cartão ou senha. Se reprovar, a resposta vira um texto de reserva, e o nível 0 passa a 1.
- **Injeção de instrução:** a mensagem do cliente vai entre delimitadores, tratada como dado, e variações do delimitador são neutralizadas. Além disso, o modelo não decide nível nem ação.
- **Falhas** (tempo esgotado, limite do provedor, JSON inválido, erro interno) levam ao nível 2, com "falha interna: revisão humana". O erro original não é exposto.
- **Rota pública:** só aceita a mesma origem; corpo até 10 KB e mensagem até 2.000 caracteres; 10 requisições por minuto e 100 por dia por IP, mais um teto diário global. Os limites ficam em memória e, em serverless, são parciais: cada instância conta separado.
- **Contingência rotulada:** se o limite for atingido ou o modelo falhar, os 8 exemplos prontos reproduzem saídas gravadas do modelo. A decisão é recalculada pelo código, e a tela avisa "Resposta gravada" com o motivo real. Mensagens livres não têm contingência.

## Testes

```bash
cd app
npm test          # 1.211 testes (vitest)
npx tsc --noEmit
npm run lint
npm run build
```

Os testes cobrem regra de autonomia, ação e trava, FAQ (incluindo nenhuma promessa nos textos), mascaramento, sinais, esquemas, checagem, cliente do modelo (com SDK falso), prompts, pipeline (com espiões e cliente falso), limites, rota, contingência e os números do painel contra `data/processed/`. Nenhum teste chama o Groq.

`npm run smoke` chama o Groq de verdade, com 5 mensagens fictícias, e precisa de `app/.env.local`. Na calibração, cada chamada levou de 0,4 s a 0,9 s, e a classificação usou até 209 tokens de completion (seção 14 do `docs/decisoes.md`). `npm run smoke -- --gravar` regrava as respostas da contingência.

## Limitações

- Os dados são sintéticos e repetitivos; com texto real, o desempenho pode ser menor.
- Não há rótulo verdadeiro. O motivo da análise vem de um classificador por regras, e a avaliação manual com cerca de 60 conversas rotuladas está pendente.
- A simulação de autonomia usa esse classificador por regras, que ainda não tem os motivos dúvida de política e direitos do titular.
- O custo por conversa é por canal: não distingue conversa resolvida pelo bot de conversa com atendente.
- A FAQ de produto e promoções está pendente (cupom, frete, ficha de produto); sem entrada validada, a conversa vai para o nível 1.
- Faltam data de entrega, dados de pagamento e fotos, por isso arrependimento, troca e reembolso ficam no nível 1.
- A ligação entre ameaça e Reclame Aqui é só indício (34 casos).
- Os limites de requisição são por instância.

## Como rodar localmente

**App** (Node 20 ou mais recente):

```bash
cd app
npm install
echo "GROQ_API_KEY=sua_chave" > .env.local   # fora do Git
npm run dev                                   # http://localhost:3000
```

Sem chave, a demo continua funcionando com os exemplos prontos (contingência).

**Análise** (Python 3.11). Exige os arquivos do desafio em `data/raw/`, que não estão no repositório:

```bash
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS: source .venv/bin/activate
pip install -r analysis/requirements.txt
python analysis/analise_atendimento.py           # grava data/processed/
```

## Deploy na Vercel

- Raiz do projeto: `app/`.
- Variáveis de ambiente:
  - `GROQ_API_KEY`, marcada como Sensitive;
  - `GROQ_MODEL`, opcional (padrão `openai/gpt-oss-20b`);
  - `LIMITE_DIARIO_GLOBAL`, opcional (padrão 300).
- **Variável nova ou alterada só vale depois de um Redeploy.**

## Decisões

O desenho completo, com as justificativas, os números preliminares e as pendências, está em [`docs/decisoes.md`](docs/decisoes.md).

## Fontes

As políticas da FAQ são paráfrases da política de atendimento do desafio e das páginas públicas do GoGroup: o Aviso de Privacidade e a [Central de Privacidade](https://privacidade.devgogroup.com). Os dados, o PDF e os arquivos do desafio não estão no repositório; só código e agregados (`data/processed/`).

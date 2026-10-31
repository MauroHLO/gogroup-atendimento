# Contexto

Desafio AI-First da GoGroup, Problema 1 (Atendimento: Gocase e GoBeauté). Entrega: link público (Vercel, sem login) e repositório público no GitHub. O desenho completo e as decisões estão em `docs/decisoes.md`: leia antes de propor mudanças.

# O que estamos construindo

Um agente que, para cada conversa de atendimento: classifica o motivo real, decide o nível de autonomia (0, 1 ou 2) por regra determinística, e devolve uma ação estruturada com resposta redigida e justificativa. Métricas centrais: "precisa de humano ou não" e "contatos evitados".

# Regras que não podem ser quebradas

- Dados brutos do desafio ficam em `data/raw/` e nunca vão para o Git. O PDF e os zips também não. Só código e agregados (`data/processed/`) são versionados.
- Antes de qualquer commit, rodar `git status` e conferir que nada de `data/raw/` ou `.env.local` entrou.
- Mascarar CPF, telefone, e-mail e cartão antes de enviar texto a qualquer LLM. Nunca logar nem guardar texto de conversa.
- O LLM não decide ação. A regra de autonomia vive em código (`app/lib/policy`), com testes. O LLM classifica e redige.
- Nunca inventar regra da empresa. Políticas só vêm do `parametros.md` e do Aviso de Privacidade público. Cupom, frete e ficha de produto estão pendentes: sem entrada validada na FAQ, a conversa vai para o nível 1.
- Reação adversa é sempre nível 2. Assuntos de saúde nunca saem da FAQ. O agente nunca pede CPF, cartão ou senha.
- Chave do Groq só por variável de ambiente (`GROQ_API_KEY`); modelo configurável por `GROQ_MODEL`. Nunca no código.
- A rota pública do agente precisa de limite de requisições e de tamanho de entrada.
- Toda conclusão numérica deve ter fonte (script em `analysis/`) e ser reproduzível. Deduplicar e validar os dados antes de calcular.

# Stack

- Python 3.11 + pandas em `analysis/` (limpeza, métricas, classificação de exploração, custos).
- Next.js + TypeScript em `app/` (interface e rota do agente), deploy na Vercel.
- Groq como LLM, com saída estruturada (JSON) e validação do esquema.

# Estrutura
    analysis/              scripts Python que geram os números e agregados
    app/                   aplicação Next.js (raiz do projeto na Vercel)
    src/lib/pii          mascaramento de dados pessoais
    src/lib/policy       regra de autonomia (determinística, testada)
    src/lib/agent        chamada ao modelo e saída estruturada
    src/lib/faq          FAQ em duas camadas (política e produto/promoções)
    src/app/api/agent    rota pública com limite de requisições
    src/app/             interface
    data/raw/              dados originais (fora do Git)
    data/processed/        agregados (podem ir para o Git)
    evals/                 casos de teste sintéticos escritos por nós
    docs/decisoes.md       decisões e justificativas

# Convenções

- Código, comentários e README em português.
- Commits pequenos e frequentes, mensagens no estilo `tipo: descrição` (feat, fix, docs, chore).
- Exemplos de demonstração e testes devem ser fictícios, criados por nós; não copiar mensagens dos dados.
- Ao mudar a regra de autonomia, atualizar `docs/decisoes.md` e os testes juntos.

# Estado atual

Ambiente e repositório criados. Desenho do agente aprovado. Análise concluída em `analysis/analise_atendimento.py` (agregados em `data/processed/`). Deploy inicial na Vercel feito. Prontos, com testes: `lib/pii` (mascaramento), `lib/policy` (regra de autonomia) e `lib/acoes` (ação sugerida com trava de autonomia, `docs/decisoes.md` seção 13). Próximo, em partes com plano, testes e commit próprios: parte 2 `lib/faq`, parte 3 `lib/agent`, parte 4 rota `api/agent`.

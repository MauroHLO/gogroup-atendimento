# Contexto
Desafio AI-First da GoGroup, Problema 1 (Atendimento). Entrega: link público (Vercel, sem login) + repo público no GitHub.

# Regras
- Dados brutos em data/raw/ nunca vão pro Git; versionar só agregados.
- Mascarar CPF e telefone antes de enviar texto a qualquer LLM.
- Deduplicar e validar dados antes de qualquer número; toda conclusão com número e fonte.
- O agente de IA deve executar uma ação útil (ex.: classificar o motivo real, sugerir ação, redigir resposta) e respeitar a política de autonomia: ações de risco (ex.: reação adversa) vão para humano.
- Chave do Groq só via variável de ambiente.

# Stack
Python + pandas (analysis/), Next.js (app/), Groq como LLM, deploy na Vercel.

# Convenções
Código e README em português; commits pequenos e frequentes.

// Rota pública do agente. A lógica está em src/lib/rota/handler.ts (testável sem rede).
// Com Cache Components ligado (Next 16), "dynamic" e "runtime" não podem ser exportados: o build
// recusa. O runtime padrão já é Node.js; POST nunca é pré-renderizado, e o handler devolve
// Cache-Control: no-store.

import { criarClienteGroq, MODELO_PADRAO } from "@/lib/agent/cliente";
import { criarHandler, criarLimitesPadrao } from "@/lib/rota/handler";

export const maxDuration = 20; // orçamento do pipeline (12 s) mais margem

export const POST = criarHandler({
  cliente: () => criarClienteGroq(),
  modelo: process.env.GROQ_MODEL?.trim() || MODELO_PADRAO,
  limites: criarLimitesPadrao(process.env),
});

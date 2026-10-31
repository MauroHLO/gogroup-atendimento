// Contingência da demonstração (docs/decisoes.md, seção 15).
// Gravamos só as saídas do modelo para os exemplos prontos e as reproduzimos pelo pipeline real:
// mascaramento, nível, ação, checagem e resumo são recalculados agora pelo código.
// Uso exclusivo do servidor (node:crypto). Mensagem digitada à mão nunca recebe gravação.

import { createHash } from "node:crypto";
import { z } from "zod";
import { processarConversa, type ResultadoAgente } from "../agent";
import { FalhaAgente, type ClienteLLM, type PedidoJson, type RespostaJson, type TipoFalha } from "../agent/cliente";
import type { ContextoPedido } from "../agent/prompts";
import { EXEMPLOS, type Exemplo } from "./exemplos";
import gravadosJson from "./gravados.json";

export const INSTRUCAO_REGRAVAR = "Regrave com: cd app && npm run smoke -- --gravar";

const Uso = z.object({ entrada: z.number(), saida: z.number(), raciocinio: z.number().nullable() }).nullable();
const Passo = z.union([
  z.object({ nome: z.enum(["classificacao", "redacao"]), dados: z.unknown(), uso: Uso }),
  z.object({ nome: z.enum(["classificacao", "redacao"]), erro: z.literal("json_invalido") }),
]);
export type Passo = z.infer<typeof Passo>;

const Gravacoes = z.object({
  versao: z.literal(1),
  gravadoEm: z.string(),
  modelo: z.string(),
  exemplos: z.record(z.string(), z.object({ hash: z.string(), passos: z.array(Passo) })),
});
export type Gravacoes = z.infer<typeof Gravacoes>;

// Arquivo inválido desliga a contingência (nunca derruba a rota).
const lidas = Gravacoes.safeParse(gravadosJson);
export const GRAVACOES: Gravacoes | null = lidas.success ? lidas.data : null;

// Motivo real da contingência: limite da rota ou falha do provedor do modelo.
export type MotivoContingencia = "ip_minuto" | "ip_dia" | "diario" | TipoFalha;
export const FALHAS_COM_CONTINGENCIA: ReadonlySet<string> = new Set<TipoFalha>([
  "timeout",
  "rate_limit",
  "indisponivel",
  "config",
  "json_invalido",
  "requisicao_recusada",
]);

export interface InfoContingencia {
  motivo: MotivoContingencia;
  gravadoEm: string;
  modelo: string;
}

function contextoIgual(a: ContextoPedido, b: ContextoPedido): boolean {
  return a.statusEntrega === b.statusEntrega && a.canal === b.canal && a.valor === b.valor && a.seq === b.seq;
}

// Exatamente a mensagem (já sem espaços nas pontas) e o contexto de um exemplo pronto.
export function exemploCorrespondente(mensagem: string, contexto: ContextoPedido): Exemplo | null {
  return EXEMPLOS.find((e) => e.mensagem === mensagem.trim() && contextoIgual(e.contexto, contexto)) ?? null;
}

// Cliente que devolve as saídas gravadas, na ordem; registra o que o pipeline pediu.
export function clienteGravado(passos: readonly Passo[], modelo: string): ClienteLLM & { pedidos: PedidoJson[] } {
  const fila = [...passos];
  const pedidos: PedidoJson[] = [];
  return {
    modelo,
    estrito: true,
    pedidos,
    async gerarJson(p: PedidoJson): Promise<RespostaJson> {
      pedidos.push(p);
      const passo = fila.shift();
      if (!passo || passo.nome !== p.nome) throw new FalhaAgente("indisponivel");
      if ("erro" in passo) throw new FalhaAgente("json_invalido");
      return { dados: passo.dados, uso: passo.uso, finishReason: "stop", ms: 0 };
    },
  };
}

// Hash do que o pipeline atual mandaria ao modelo (prompts, mensagem mascarada e esquemas).
// Se o prompt, a FAQ, as descrições de ação ou o mascaramento mudarem, o hash muda.
export function hashPedidos(pedidos: readonly PedidoJson[]): string {
  const essencial = pedidos.map((p) => [p.nome, p.sistema, p.usuario, p.esquema]);
  return createHash("sha256").update(JSON.stringify(essencial)).digest("hex");
}

export async function reproduzir(
  exemplo: Exemplo,
  passos: readonly Passo[],
  modelo: string,
): Promise<{ resultado: ResultadoAgente; hash: string }> {
  const cliente = clienteGravado(passos, modelo);
  const resultado = await processarConversa({ mensagem: exemplo.mensagem, contexto: exemplo.contexto }, { cliente });
  return { resultado, hash: hashPedidos(cliente.pedidos) };
}

// Usado pela rota: reproduz a gravação de um exemplo pronto, sem chamar o Groq nem consumir cota.
export async function tentarContingencia(
  mensagem: string,
  contexto: ContextoPedido,
  motivo: MotivoContingencia,
  gravacoes: Gravacoes | null = GRAVACOES,
): Promise<(ResultadoAgente & { contingencia: InfoContingencia }) | null> {
  if (!gravacoes) return null;
  const exemplo = exemploCorrespondente(mensagem, contexto);
  if (!exemplo) return null;
  const gravacao = gravacoes.exemplos[exemplo.id];
  if (!gravacao) return null;
  const { resultado } = await reproduzir(exemplo, gravacao.passos, gravacoes.modelo);
  if (resultado.falha) return null; // gravação incompatível: melhor não mostrar
  return { ...resultado, contingencia: { motivo, gravadoEm: gravacoes.gravadoEm, modelo: gravacoes.modelo } };
}

"use client";

// Demonstração: formulário (mensagem, exemplos prontos, contexto simulado) e chamada à rota.
// Nada da mensagem é guardado: fica só no estado da página, no navegador.

import { useId, useState, type FormEvent } from "react";
import type { ResultadoAgente } from "@/lib/agent";
import type { ContextoPedido } from "@/lib/agent/prompts";
import { EXEMPLOS, type Exemplo } from "@/lib/demo/exemplos";
import { Resultado } from "./Resultado";

const LIMITE_MENSAGEM = 2_000;

const STATUS: { valor: ContextoPedido["statusEntrega"]; rotulo: string }[] = [
  { valor: "em_separacao", rotulo: "Em separação" },
  { valor: "em_transito", rotulo: "Em trânsito" },
  { valor: "entregue", rotulo: "Entregue" },
  { valor: "atrasado", rotulo: "Atrasado" },
  { valor: "aguardando_pagamento", rotulo: "Aguardando pagamento" },
];

const CANAIS: { valor: ContextoPedido["canal"]; rotulo: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "reclame_aqui", rotulo: "Reclame Aqui" },
];

export type RespostaRota = ResultadoAgente & { modelo: string | null };

export type Estado =
  | { tipo: "ocioso" }
  | { tipo: "carregando" }
  | { tipo: "ok"; resultado: RespostaRota; mensagemEnviada: string; ms: number }
  | { tipo: "erro"; texto: string }
  | { tipo: "limite"; limite: string; reiniciaEm: string | null };

const CONTEXTO_INICIAL: ContextoPedido = EXEMPLOS[0].contexto;

const campo =
  "w-full rounded-md border border-zinc-400 bg-white px-3 py-2 text-base text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1";

export function Demo() {
  const [mensagem, setMensagem] = useState("");
  const [contexto, setContexto] = useState<ContextoPedido>(CONTEXTO_INICIAL);
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });
  const id = useId();

  function usarExemplo(e: Exemplo) {
    setMensagem(e.mensagem);
    setContexto({ ...e.contexto });
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const texto = mensagem.trim();
    if (!texto || estado.tipo === "carregando") return;
    setEstado({ tipo: "carregando" });
    const inicio = performance.now();
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: texto, contexto }),
      });
      const corpo = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const ms = Math.round(performance.now() - inicio);
      if (res.status === 200 && corpo && typeof corpo.nivel === "number") {
        setEstado({ tipo: "ok", resultado: corpo as unknown as RespostaRota, mensagemEnviada: texto, ms });
      } else if (res.status === 429) {
        setEstado({
          tipo: "limite",
          limite: typeof corpo?.limite === "string" ? corpo.limite : "desconhecido",
          reiniciaEm: typeof corpo?.reiniciaEm === "string" ? corpo.reiniciaEm : null,
        });
      } else if (res.status === 413) {
        setEstado({ tipo: "erro", texto: "A mensagem é grande demais. Use até 2.000 caracteres." });
      } else if (res.status === 400) {
        setEstado({ tipo: "erro", texto: "Não foi possível entender o pedido. Confira a mensagem e o contexto." });
      } else if (res.status === 403) {
        setEstado({ tipo: "erro", texto: "Esta demonstração só aceita pedidos feitos a partir da própria página." });
      } else {
        setEstado({ tipo: "erro", texto: "O servidor não respondeu como esperado. Tente de novo em instantes." });
      }
    } catch {
      setEstado({ tipo: "erro", texto: "Sem conexão com o servidor. Verifique a internet e tente de novo." });
    }
  }

  const carregando = estado.tipo === "carregando";
  const restantes = LIMITE_MENSAGEM - mensagem.length;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <form onSubmit={enviar} className="space-y-5 rounded-lg border border-zinc-300 bg-white p-4 sm:p-6" noValidate>
        <section aria-labelledby={`${id}-exemplos`}>
          <h2 id={`${id}-exemplos`} className="text-base font-semibold">
            Exemplos prontos
          </h2>
          <p className="mt-1 text-sm text-zinc-700">Preenchem a mensagem e o contexto. Todos são fictícios.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {EXEMPLOS.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => usarExemplo(e)}
                  title={e.esperado}
                  className="rounded-full border border-zinc-400 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  {e.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div>
          <label htmlFor={`${id}-mensagem`} className="block text-base font-semibold">
            Mensagem do cliente
          </label>
          <textarea
            id={`${id}-mensagem`}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value.slice(0, LIMITE_MENSAGEM))}
            rows={5}
            maxLength={LIMITE_MENSAGEM}
            required
            aria-describedby={`${id}-contador`}
            placeholder="Escreva uma mensagem fictícia ou escolha um exemplo."
            className={`${campo} mt-2 resize-y`}
          />
          <p id={`${id}-contador`} className="mt-1 text-sm text-zinc-700">
            {restantes} de {LIMITE_MENSAGEM} caracteres restantes
          </p>
        </div>

        <fieldset className="rounded-md border border-zinc-300 p-3 sm:p-4">
          <legend className="px-1 text-base font-semibold">Contexto simulado do pedido</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-status`} className="block text-sm font-medium">
                Status da entrega
              </label>
              <select
                id={`${id}-status`}
                value={contexto.statusEntrega}
                onChange={(e) => setContexto({ ...contexto, statusEntrega: e.target.value as ContextoPedido["statusEntrega"] })}
                className={`${campo} mt-1`}
              >
                {STATUS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-canal`} className="block text-sm font-medium">
                Canal
              </label>
              <select
                id={`${id}-canal`}
                value={contexto.canal}
                onChange={(e) => setContexto({ ...contexto, canal: e.target.value as ContextoPedido["canal"] })}
                className={`${campo} mt-1`}
              >
                {CANAIS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-valor`} className="block text-sm font-medium">
                Valor do pedido (R$)
              </label>
              <input
                id={`${id}-valor`}
                type="number"
                inputMode="decimal"
                min={0}
                max={10_000}
                step={0.01}
                value={contexto.valor}
                onChange={(e) => setContexto({ ...contexto, valor: Number(e.target.value) })}
                aria-describedby={`${id}-valor-dica`}
                className={`${campo} mt-1`}
              />
              <p id={`${id}-valor-dica`} className="mt-1 text-xs text-zinc-700">
                Acima de R$ 200, sobe para pelo menos nível 1.
              </p>
            </div>
            <div>
              <label htmlFor={`${id}-seq`} className="block text-sm font-medium">
                Nº do contato sobre o pedido
              </label>
              <input
                id={`${id}-seq`}
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                step={1}
                value={contexto.seq}
                onChange={(e) => setContexto({ ...contexto, seq: Number(e.target.value) })}
                aria-describedby={`${id}-seq-dica`}
                className={`${campo} mt-1`}
              />
              <p id={`${id}-seq-dica`} className="mt-1 text-xs text-zinc-700">
                2º contato: pelo menos nível 1. 3º ou mais: nível 2.
              </p>
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={carregando || mensagem.trim() === ""}
          aria-disabled={carregando || mensagem.trim() === ""}
          className="w-full rounded-md bg-blue-700 px-4 py-3 text-base font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto"
        >
          {carregando ? "Analisando…" : "Analisar mensagem"}
        </button>
      </form>

      <Resultado estado={estado} />
    </div>
  );
}

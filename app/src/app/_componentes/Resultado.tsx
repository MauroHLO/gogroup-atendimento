"use client";

// Versão mínima; a exibição completa do resultado e dos estados vem no próximo commit.

import type { Estado } from "./Demo";

export function Resultado({ estado }: { estado: Estado }) {
  return (
    <section aria-live="polite" className="rounded-lg border border-zinc-300 bg-white p-4 sm:p-6">
      <h2 className="text-base font-semibold">Resultado</h2>
      <p className="mt-2 text-sm text-zinc-700">
        {estado.tipo === "ocioso" && "Escolha um exemplo ou escreva uma mensagem e clique em Analisar."}
        {estado.tipo === "carregando" && "Analisando…"}
        {estado.tipo === "ok" && `Nível ${estado.resultado.nivel}`}
        {estado.tipo === "erro" && estado.texto}
        {estado.tipo === "limite" && "Limite da demonstração atingido."}
      </p>
    </section>
  );
}

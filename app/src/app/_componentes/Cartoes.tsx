// Faixa do topo: três números grandes, com o tipo em letra pequena. Os valores vêm de lib/impacto.

import { CARTOES, ROTULO } from "@/lib/impacto";

export function Cartoes() {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {CARTOES.map((c) => (
        <li key={c.id} title={c.detalhe} className="rounded-lg border-t-4 border border-zinc-300 border-t-marca bg-white px-4 py-3">
          <p className="text-3xl font-bold tracking-tight tabular-nums text-zinc-950 sm:text-4xl">{c.valor}</p>
          <p className="mt-1 text-sm text-zinc-800">{c.texto}</p>
          <p className="mt-1 text-xs text-zinc-600">{c.rotulos.map((r) => ROTULO[r]).join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}

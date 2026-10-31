// Painel de impacto (Server Component): só renderiza os textos e números de lib/impacto.
// Barras em CSS com o número sempre visível em texto; sem biblioteca de gráfico.

import {
  INTRODUCAO_PAINEL,
  PAINEL,
  ROTULO,
  descreverFonte,
  fmtInt,
  fmtPct,
  type BlocoImpacto,
  type ChaveAgregado,
  type NivelSimulado,
  type Rotulo,
} from "@/lib/impacto";

const COR_ROTULO: Record<Rotulo, string> = {
  estimado: "border-sky-700 text-sky-900",
  amostra: "border-zinc-500 text-zinc-800",
  hipotese: "border-violet-700 text-violet-900",
  associacao: "border-amber-700 text-amber-900",
};

const COR_BARRA: Record<NivelSimulado["nivel"], string> = {
  0: "bg-emerald-700",
  1: "bg-amber-600",
  2: "bg-red-700",
};

function Rotulos({ rotulos }: { rotulos: readonly Rotulo[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {rotulos.map((r) => (
        <span key={r} className={`rounded border px-1.5 py-0.5 text-xs ${COR_ROTULO[r]}`}>
          {ROTULO[r]}
        </span>
      ))}
    </span>
  );
}

function Fontes({ bloco }: { bloco: BlocoImpacto }) {
  const chaves = [...new Set<ChaveAgregado>([...bloco.destaques, ...bloco.linhas].flatMap((x) => x.fontes))];
  if (bloco.niveis) chaves.push("nivel0Conversas", "nivel1Conversas", "nivel2Conversas");
  if (chaves.length === 0) return null;
  return (
    <details className="mt-3 text-xs text-zinc-700">
      <summary className="cursor-pointer">Fontes (data/processed/)</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono break-words">
        {chaves.map((k) => (
          <li key={k}>{descreverFonte(k)}</li>
        ))}
        {bloco.niveis && <li>autonomia.csv → pct_conversas e pct_custo de cada nível</li>}
      </ul>
    </details>
  );
}

function Barra({ pct, cor, rotulo }: { pct: number; cor: string; rotulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 w-full max-w-48 rounded bg-zinc-200" aria-hidden="true">
        <div className={`h-3 rounded ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right tabular-nums">
        {fmtPct(pct)}
        <span className="sr-only"> {rotulo}</span>
      </span>
    </div>
  );
}

function Niveis({ niveis }: { niveis: readonly NivelSimulado[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">Simulação de autonomia por nível: conversas, percentual das conversas e do custo</caption>
        <thead>
          <tr className="border-b border-zinc-300 text-zinc-700">
            <th scope="col" className="py-2 pr-3 font-medium">Nível</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Conversas</th>
            <th scope="col" className="py-2 pr-3 font-medium">% das conversas</th>
            <th scope="col" className="py-2 font-medium">% do custo</th>
          </tr>
        </thead>
        <tbody>
          {niveis.map((n) => (
            <tr key={n.nivel} className="border-b border-zinc-200">
              <th scope="row" className="py-2 pr-3 font-medium">{n.titulo}</th>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(n.conversas)}</td>
              <td className="py-2 pr-3">
                <Barra pct={n.pctConversas} cor={COR_BARRA[n.nivel]} rotulo="das conversas" />
              </td>
              <td className="py-2">
                <Barra pct={n.pctCusto} cor={COR_BARRA[n.nivel]} rotulo="do custo" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bloco({ bloco }: { bloco: BlocoImpacto }) {
  const tituloId = `impacto-${bloco.id}`;
  return (
    <section aria-labelledby={tituloId} className="border-t border-zinc-200 pt-6">
      <h3 id={tituloId} className="text-lg font-semibold">
        {bloco.titulo}
      </h3>
      {bloco.introducao && <p className="mt-1 text-sm text-zinc-700">{bloco.introducao}</p>}
      {bloco.aviso && (
        <p role="note" className="mt-3 rounded-md border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {bloco.aviso}
        </p>
      )}

      {bloco.destaques.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bloco.destaques.map((x) => (
            <li key={x.valor} className="rounded-md border border-zinc-300 bg-white px-4 py-3">
              <p className="text-2xl font-semibold tabular-nums">{x.valor}</p>
              <p className="mt-1 text-sm text-zinc-800">{x.texto}</p>
              <Rotulos rotulos={x.rotulos} />
            </li>
          ))}
        </ul>
      )}

      {bloco.niveis && (
        <div className="mt-4">
          <Niveis niveis={bloco.niveis} />
        </div>
      )}
      {bloco.conclusao && <p className="mt-3 text-base font-medium text-zinc-900">{bloco.conclusao}</p>}

      {bloco.linhas.length > 0 && (
        <ul className="mt-4 space-y-3 text-sm text-zinc-800">
          {bloco.linhas.map((l) => (
            <li key={l.texto}>
              {l.texto}
              <Rotulos rotulos={l.rotulos} />
            </li>
          ))}
        </ul>
      )}

      {bloco.limites && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
          {bloco.limites.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <Fontes bloco={bloco} />
    </section>
  );
}

export function Impacto() {
  return (
    <section aria-labelledby="impacto-titulo" className="space-y-6">
      <div>
        <h2 id="impacto-titulo" className="text-xl font-semibold tracking-tight sm:text-2xl">
          Impacto: o que os dados mostram
        </h2>
        <p className="mt-2 text-sm text-zinc-700">{INTRODUCAO_PAINEL}</p>
      </div>
      {PAINEL.map((b) => (
        <Bloco key={b.id} bloco={b} />
      ))}
    </section>
  );
}

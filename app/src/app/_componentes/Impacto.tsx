// Painel de impacto (Server Component): só renderiza os textos e números de lib/impacto.
// Gráficos em CSS puro: cada barra tem title e aria-label, e cada gráfico tem a tabela em <details>.

import type { ReactNode } from "react";
import {
  AGREGADOS,
  CANAIS,
  INTRODUCAO_PAINEL,
  LEGENDA_CANAIS,
  LEGENDA_MOTIVOS,
  LEGENDA_SOLIDEZ,
  MOTIVOS,
  NOTA_SOLIDEZ,
  ORIGEM_NUMEROS,
  PAINEL,
  ROTULO,
  SERIES_NIVEIS,
  descreverFonte,
  fmtInt,
  fmtPct1,
  type BlocoImpacto,
  type ChaveAgregado,
  type Rotulo,
} from "@/lib/impacto";
import { FUNDO_NIVEL, RotuloNivel } from "./Nivel";

const COR_ROTULO: Record<Rotulo, string> = {
  estimado: "border-sky-700 text-sky-900",
  amostra: "border-zinc-500 text-zinc-800",
  hipotese: "border-violet-700 text-violet-900",
  associacao: "border-amber-700 text-amber-900",
};

const RESUMO_DETALHES = "cursor-pointer font-medium text-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca";

function bloco(id: string): BlocoImpacto {
  const b = PAINEL.find((x) => x.id === id);
  if (!b) throw new Error(`bloco ausente: ${id}`);
  return b;
}

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

function ListaFontes({ chaves, extra }: { chaves: readonly ChaveAgregado[]; extra?: string }) {
  return (
    <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-xs break-words text-zinc-700">
      {[...new Set(chaves)].map((k) => (
        <li key={k}>{descreverFonte(k)}</li>
      ))}
      {extra && <li>{extra}</li>}
    </ul>
  );
}

function Grafico({
  titulo,
  legenda,
  tabela,
  children,
}: {
  titulo: string;
  legenda: string;
  tabela: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 rounded-lg border border-zinc-300 bg-white p-4 sm:p-5">
      <h3 className="text-lg font-semibold text-zinc-950">{titulo}</h3>
      <figcaption className="mt-0.5 text-sm text-zinc-700">{legenda}</figcaption>
      <div className="mt-4">{children}</div>
      <details className="mt-4 text-sm">
        <summary className={RESUMO_DETALHES}>Ver em tabela, com a fonte</summary>
        <div className="mt-2">{tabela}</div>
      </details>
    </figure>
  );
}

const CELULA = "py-1.5 pr-3";
const CELULA_NUM = "py-1.5 text-right tabular-nums";

function GraficoNiveis() {
  const b = bloco("autonomia");
  const niveis = b.niveis ?? [];
  return (
    <Grafico
      titulo="Conversas vs custo por nível"
      legenda={b.legenda ?? ""}
      tabela={
        <>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Simulação de autonomia por nível: conversas, percentual das conversas e do custo</caption>
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-700">
                <th scope="col" className={`${CELULA} font-medium`}>Nível</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Conversas</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">% conversas</th>
                <th scope="col" className="py-1.5 text-right font-medium">% custo</th>
              </tr>
            </thead>
            <tbody>
              {niveis.map((n) => (
                <tr key={n.nivel} className="border-b border-zinc-200">
                  <th scope="row" className={CELULA} title={n.titulo}>
                    <RotuloNivel nivel={n.nivel} />
                  </th>
                  <td className={`${CELULA_NUM} pr-3`}>{fmtInt(n.conversas)}</td>
                  <td className={`${CELULA_NUM} pr-3`}>{fmtPct1(n.pctConversas)}</td>
                  <td className={CELULA_NUM}>{fmtPct1(n.pctCusto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {b.introducao && <p className="mt-2 text-zinc-700">{b.introducao}</p>}
          {b.aviso && <p className="mt-2 text-zinc-700">{b.aviso}</p>}
          <ListaFontes
            chaves={["nivel0Conversas", "nivel1Conversas", "nivel2Conversas"]}
            extra="autonomia.csv → pct_conversas e pct_custo de cada nível"
          />
        </>
      }
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legenda dos níveis">
        {niveis.map((n) => (
          <li key={n.nivel}>
            <RotuloNivel nivel={n.nivel} />
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-4">
        {SERIES_NIVEIS.map((s) => (
          <div key={s.id}>
            <p className="text-sm font-semibold text-zinc-900">
              {s.rotulo} <span className="font-normal text-zinc-600">({ROTULO[s.tipo]})</span>
            </p>
            <div className="mt-1 flex gap-0.5">
              {s.segmentos.map((x) => {
                const texto = `Nível ${x.nivel}: ${fmtPct1(x.pct)} ${s.rotulo.replace("% ", "")}`;
                return (
                  <div
                    key={x.nivel}
                    role="img"
                    aria-label={texto}
                    title={texto}
                    style={{ flexBasis: `${x.pct}%` }}
                    className={`flex h-11 min-w-0 grow-0 items-center justify-center rounded-sm text-sm font-bold text-zinc-950 sm:h-12 sm:text-base ${FUNDO_NIVEL[x.nivel]}`}
                  >
                    <span aria-hidden="true" className="hidden sm:inline">
                      {fmtPct1(x.pct)}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* No celular o menor segmento não comporta o número: os valores vêm logo abaixo, em texto. */}
            <ul aria-hidden="true" className="mt-1 flex flex-wrap gap-x-3 text-xs font-medium text-zinc-800 sm:hidden">
              {s.segmentos.map((x) => (
                <li key={x.nivel}>
                  Nível {x.nivel}: {fmtPct1(x.pct)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {b.conclusao && <p className="mt-4 text-sm font-medium text-zinc-900 sm:text-base">{b.conclusao}</p>}
    </Grafico>
  );
}

function GraficoCanais() {
  const escala = Math.max(...CANAIS.flatMap((c) => [c.pctConversas, c.pctCusto]));
  // A barra maior ocupa 78% da coluna; o resto fica para o número ao lado, mesmo a 375px.
  const largura = (pct: number) => `${Math.max((pct / escala) * 78, 0.5)}%`;
  return (
    <Grafico
      titulo="Canais: conversas vs custo"
      legenda={LEGENDA_CANAIS}
      tabela={
        <>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Percentual das conversas e do custo por canal</caption>
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-700">
                <th scope="col" className={`${CELULA} font-medium`}>Canal</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">% conversas</th>
                <th scope="col" className="py-1.5 text-right font-medium">% custo</th>
              </tr>
            </thead>
            <tbody>
              {CANAIS.map((c) => (
                <tr key={c.id} className="border-b border-zinc-200">
                  <th scope="row" className={`${CELULA} font-medium`}>{c.rotulo}</th>
                  <td className={`${CELULA_NUM} pr-3`}>{fmtPct1(c.pctConversas)}</td>
                  <td className={CELULA_NUM}>{fmtPct1(c.pctCusto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListaFontes
            chaves={["raPctConversas", "raPctCusto", "whatsappPctConversas", "whatsappPctCusto", "emailPctConversas", "emailPctCusto"]}
          />
        </>
      }
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-900" aria-label="Legenda das séries">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm bg-serie-azul" />% das conversas ({ROTULO.amostra})
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm bg-serie-laranja" />% do custo ({ROTULO.estimado})
        </li>
      </ul>
      <ul className="mt-3 space-y-2">
        {CANAIS.map((c) => (
          <li key={c.id} className={`rounded-md px-2 py-2 ${c.destaque ? "border border-marca bg-blue-50" : ""}`}>
            <p className={`text-sm text-zinc-950 ${c.destaque ? "font-bold" : "font-medium"}`}>{c.rotulo}</p>
            {(
              [
                ["das conversas", c.pctConversas, "bg-serie-azul"],
                ["do custo", c.pctCusto, "bg-serie-laranja"],
              ] as const
            ).map(([serie, pct, cor]) => {
              const texto = `${c.rotulo}: ${fmtPct1(pct)} ${serie}`;
              return (
                <div key={serie} className="mt-1 flex items-center gap-1.5">
                  <div role="img" aria-label={texto} title={texto} style={{ width: largura(pct) }} className={`h-5 rounded-sm ${cor}`} />
                  <span aria-hidden="true" className={`text-xs tabular-nums text-zinc-900 ${c.destaque ? "font-bold" : ""}`}>
                    {fmtPct1(pct)}
                  </span>
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </Grafico>
  );
}

function GraficoMotivos() {
  const escala = Math.max(...MOTIVOS.map((m) => m.pctCusto));
  return (
    <Grafico
      titulo="Custo por motivo"
      legenda={`${LEGENDA_MOTIVOS} (${ROTULO.estimado})`}
      tabela={
        <>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Percentual do custo por motivo</caption>
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-700">
                <th scope="col" className={`${CELULA} font-medium`}>Motivo</th>
                <th scope="col" className="py-1.5 text-right font-medium">% custo</th>
              </tr>
            </thead>
            <tbody>
              {MOTIVOS.map((m) => (
                <tr key={m.id} className="border-b border-zinc-200">
                  <th scope="row" className={`${CELULA} font-normal`}>{m.rotulo}</th>
                  <td className={CELULA_NUM}>{fmtPct1(m.pctCusto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 font-mono text-xs break-words text-zinc-700">
            {AGREGADOS.atrasoPctCusto.arquivo} → pct_custo de cada motivo
          </p>
        </>
      }
    >
      <ul className="space-y-1">
        {MOTIVOS.map((m) => {
          const texto = `${m.rotulo}: ${fmtPct1(m.pctCusto)} do custo`;
          return (
            <li key={m.id} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-2 text-xs sm:text-sm">
              <span aria-hidden="true" className={`leading-tight text-zinc-900 ${m.destaque ? "font-bold" : ""}`}>
                {m.rotulo}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  role="img"
                  aria-label={texto}
                  title={texto}
                  style={{ width: `${Math.max((m.pctCusto / escala) * 74, 0.5)}%` }}
                  className={`h-3.5 rounded-sm bg-serie-azul ${m.destaque ? "" : "opacity-40"}`}
                />
                <span aria-hidden="true" className={`text-xs tabular-nums text-zinc-900 ${m.destaque ? "font-bold" : ""}`}>
                  {fmtPct1(m.pctCusto)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Grafico>
  );
}

function LegendaSolidez() {
  const [solido, hachurado] = LEGENDA_SOLIDEZ.split("; ");
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-700">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-5 rounded-sm bg-zinc-500" />
        {solido};
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="hachurado h-3 w-5 rounded-sm border border-zinc-500" />
        {hachurado}.
      </span>
      <span>{NOTA_SOLIDEZ}</span>
    </p>
  );
}

// Cartões compactos do que os gráficos não mostram; o texto completo e as fontes ficam recolhidos.
function BlocoCompacto({ b }: { b: BlocoImpacto }) {
  const tituloId = `impacto-${b.id}`;
  const visiveis = b.destaques.filter((x) => x.curto);
  const chaves = [...b.destaques, ...b.linhas].flatMap((x) => x.fontes);
  return (
    <section aria-labelledby={tituloId}>
      <h3 id={tituloId} className="text-lg font-semibold text-zinc-950">
        {b.titulo}
      </h3>
      {b.legenda && <p className="mt-0.5 text-sm text-zinc-700">{b.legenda}</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visiveis.map((x) => (
          <li key={x.valor} title={x.texto} className="rounded-md border border-zinc-300 bg-white px-3 py-2">
            <p className="text-xl font-bold tabular-nums text-zinc-950">{x.valor}</p>
            <p className="text-sm text-zinc-800">{x.curto}</p>
            <Rotulos rotulos={x.rotulos} />
          </li>
        ))}
      </ul>
      <details className="mt-3 text-sm">
        <summary className={RESUMO_DETALHES}>Texto completo e fontes</summary>
        {b.introducao && <p className="mt-2 text-zinc-700">{b.introducao}</p>}
        <ul className="mt-2 space-y-2 text-zinc-800">
          {b.destaques.map((x) => (
            <li key={x.valor}>
              <strong className="tabular-nums">{x.valor}</strong> {x.texto}
              <Rotulos rotulos={x.rotulos} />
            </li>
          ))}
          {b.linhas.map((l) => (
            <li key={l.texto}>
              {l.texto}
              <Rotulos rotulos={l.rotulos} />
            </li>
          ))}
        </ul>
        <ListaFontes chaves={chaves} />
      </details>
    </section>
  );
}

// Blocos só de texto: recolhidos, com o resumo de uma linha sempre visível.
function BlocoRecolhido({ b }: { b: BlocoImpacto }) {
  const chaves = b.linhas.flatMap((x) => x.fontes);
  return (
    <details className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-marca">
        <span className="font-semibold text-marca">{b.titulo}.</span> <span className="text-zinc-800">{b.resumo}</span>
      </summary>
      {b.linhas.length > 0 && (
        <ul className="mt-3 space-y-3 text-zinc-800">
          {b.linhas.map((l) => (
            <li key={l.texto}>
              {l.texto}
              <Rotulos rotulos={l.rotulos} />
            </li>
          ))}
        </ul>
      )}
      {b.limites && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-zinc-800">
          {b.limites.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {chaves.length > 0 && <ListaFontes chaves={chaves} />}
    </details>
  );
}

export function Impacto() {
  return (
    <section aria-labelledby="impacto-titulo" className="space-y-6">
      <div>
        <h2 id="impacto-titulo" className="text-xl font-semibold tracking-tight text-marca sm:text-2xl">
          Impacto: o que os dados mostram
        </h2>
        <p className="mt-1 text-sm text-zinc-700">{INTRODUCAO_PAINEL}</p>
        <div className="mt-2">
          <LegendaSolidez />
        </div>
      </div>

      <GraficoNiveis />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <GraficoCanais />
        <GraficoMotivos />
      </div>

      <BlocoCompacto b={bloco("problema")} />
      <BlocoCompacto b={bloco("evitaveis")} />

      <div className="space-y-3">
        <BlocoRecolhido b={bloco("defesa")} />
        <BlocoRecolhido b={bloco("limites")} />
      </div>
      <p className="text-xs text-zinc-700">{ORIGEM_NUMEROS}</p>
    </section>
  );
}

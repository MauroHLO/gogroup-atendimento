"use client";

// Exibição do resultado e dos estados (ocioso, carregando, erro, limite, ok).
// O nível aparece com cor, símbolo e texto. A mensagem enviada só é usada para mostrar,
// no navegador, o que o modelo viu (mascarada); a API não a devolve.

import { useEffect, useRef, type ReactNode } from "react";
import {
  AUTONOMIA,
  checagemNaoAplicavel,
  dataBrasilia,
  ESTADO_ETAPA,
  etapasDoPipeline,
  FALHA,
  horaBrasilia,
  itensDaChecagem,
  NIVEL,
  oQueOModeloViu,
  rotuloLimite,
  rotuloMotivoContingencia,
} from "@/lib/demo/apresentacao";
import type { Estado, RespostaRota } from "./Demo";
import { BORDA_NIVEL, FUNDO_CLARO_NIVEL, SimboloNivel } from "./Nivel";

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">{titulo}</h3>
      <div className="mt-2 text-sm text-zinc-900">{children}</div>
    </section>
  );
}

// Ícone sempre em chip colorido com glifo escuro: a cor marca, o texto continua legível (AA).
const COR_ICONE = {
  ok: "bg-nivel-0",
  gravada: "bg-violet-200",
  falhou: "bg-nivel-2",
  pulada: "bg-zinc-200",
  nao_informada: "bg-zinc-200",
} as const;

function Icone({ estado }: { estado: keyof typeof COR_ICONE }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-zinc-950 ${COR_ICONE[estado]}`}
    >
      {ESTADO_ETAPA[estado].icone}
    </span>
  );
}

function ListaChecagem({ itens }: { itens: ReturnType<typeof itensDaChecagem> }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {itens.map((i) => (
        <li key={i.id} className="flex items-start gap-1.5">
          <Icone estado={i.ok ? "ok" : "falhou"} />
          <span className="min-w-0">
            <span className="sr-only">{i.ok ? "Passou: " : "Reprovou: "}</span>
            {i.rotulo}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FaixaPipeline({ r }: { r: RespostaRota }) {
  return (
    <section aria-label="Etapas do pipeline nesta mensagem">
      <ol className="grid gap-1.5 sm:grid-cols-5 sm:gap-1">
        {etapasDoPipeline(r).map((e) => (
          <li
            key={e.id}
            className={`rounded-md border px-2 py-1.5 text-xs ${
              e.levouAoNivel ? `border-2 ${BORDA_NIVEL[r.nivel]} ${FUNDO_CLARO_NIVEL[r.nivel]}` : "border-zinc-300 bg-white"
            }`}
          >
            {/* Ícone acima do nome no desktop: a coluna é estreita e o nome não pode quebrar no meio. */}
            <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 sm:flex-col sm:items-start sm:gap-1 sm:text-xs xl:text-sm">
              <Icone estado={e.estado} />
              <span>{e.nome}</span>
            </p>
            <p className="mt-0.5 break-words text-zinc-700">
              {ESTADO_ETAPA[e.estado].rotulo}: {e.detalhe}
            </p>
            {e.levouAoNivel && <p className="mt-0.5 font-semibold text-zinc-900">levou ao nível {r.nivel}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Detalhes({ r, ms, mensagemEnviada }: { r: RespostaRota; ms: number; mensagemEnviada: string }) {
  const nivel = NIVEL[r.nivel];
  const outros = r.motivos.slice(1);
  return (
    <div className="space-y-4">
      {r.contingencia && (
        <div role="note" className="rounded-md border-2 border-dashed border-violet-700 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <p className="text-base font-semibold">
            Resposta gravada: {rotuloMotivoContingencia(r.contingencia.motivo)}
          </p>
          <p className="mt-1">
            O modelo não foi chamado agora. As saídas do modelo ({r.contingencia.modelo}) foram gravadas em{" "}
            {dataBrasilia(r.contingencia.gravadoEm)} para este exemplo pronto; a decisão abaixo (nível, ação e
            checagens) foi calculada agora pelo código.
          </p>
        </div>
      )}

      <div className={`flex items-start gap-3 rounded-lg border-2 px-4 py-4 ${BORDA_NIVEL[r.nivel]} ${FUNDO_CLARO_NIVEL[r.nivel]}`}>
        <SimboloNivel nivel={r.nivel} tamanho="grande" />
        <div className="min-w-0 text-zinc-950">
          <p className="text-xl font-bold sm:text-2xl">{nivel.titulo}</p>
          <p className="mt-1 text-sm">{nivel.descricao}</p>
        </div>
      </div>

      <FaixaPipeline r={r} />

      {r.falha && (
        <p role="alert" className="rounded-md border border-red-700 bg-white px-3 py-2 text-sm text-red-900">
          <strong>O modelo não respondeu como esperado:</strong> {FALHA[r.falha.tipo] ?? "falha desconhecida"}. Por
          segurança, o caso vai para uma pessoa.
        </p>
      )}

      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium text-zinc-700">Motivo principal</dt>
        <dd className="font-mono">{r.motivoPrincipal ?? "não identificado"}</dd>
        {outros.length > 0 && (
          <>
            <dt className="font-medium text-zinc-700">Outros motivos</dt>
            <dd className="font-mono">{outros.join(", ")}</dd>
          </>
        )}
        <dt className="font-medium text-zinc-700">Sinais</dt>
        <dd>
          {[r.sinais.saude && "saúde", r.sinais.ameaca && "ameaça"].filter(Boolean).join(", ") || "nenhum"}
        </dd>
      </dl>

      <Bloco titulo="Ação sugerida (decidida pelo código)">
        <p>
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono">{r.acao.acao}</code>{" "}
          <span className="text-zinc-700">· {AUTONOMIA[r.acao.autonomia]}</span>
        </p>
        <p className="mt-1">{r.acao.descricao}</p>
        {r.acao.ajuste && <p className="mt-1 text-zinc-700">Ajuste: {r.acao.ajuste}</p>}
      </Bloco>

      <Bloco titulo="Por que este nível">
        <ol className="list-decimal space-y-1 pl-5">
          {r.razoes.map((razao, i) => (
            <li key={i}>{razao}</li>
          ))}
        </ol>
      </Bloco>

      {r.resposta !== null ? (
        <Bloco titulo={r.nivel === 0 ? "Resposta ao cliente" : "Rascunho para aprovação"}>
          <blockquote className="whitespace-pre-wrap rounded-md border-l-4 border-marca bg-blue-50 px-3 py-2 text-zinc-900">
            {r.resposta}
          </blockquote>
          {r.fallback && (
            <p className="mt-2 text-zinc-700">
              O texto redigido pelo modelo reprovou na checagem e foi trocado pelo texto seguro de reserva.
            </p>
          )}
        </Bloco>
      ) : (
        r.resumoInterno && (
          <Bloco titulo="Resumo interno (nenhuma resposta vai ao cliente)">
            <p className="whitespace-pre-wrap rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs leading-relaxed">
              {r.resumoInterno}
            </p>
          </Bloco>
        )
      )}

      <Bloco titulo="Checagens do texto">
        {r.checagem === null ? (
          <p>{checagemNaoAplicavel(r.nivel)}</p>
        ) : (
          <>
            <p className="mb-2 font-medium">{r.checagem.ok ? "Aprovado" : "Reprovado"}</p>
            <ListaChecagem itens={itensDaChecagem(r.checagem, r.nivel)} />
          </>
        )}
      </Bloco>

      <details className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-marca">
          Detalhes técnicos: telemetria e classificação
        </summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="font-medium text-zinc-700">Tópico de política</dt>
          <dd className="font-mono break-words">{r.topico ?? "nenhum"}</dd>
          <dt className="font-medium text-zinc-700">Confiança</dt>
          <dd>{r.confianca === null ? "não disponível" : r.confianca.toFixed(2)}</dd>
        </dl>
        <p className="mt-2">
          Tempo total: {ms} ms{r.modelo ? ` · modelo ${r.modelo}` : ""}
          {r.contingencia ? " · tokens da gravação, sem chamada agora" : ""}
        </p>
        {r.chamadas.length > 0 && (
          <ul className="mt-1 space-y-0.5 font-mono text-xs break-words">
            {r.chamadas.map((c, i) => (
              <li key={i}>
                {c.nome}: {c.uso ? `${c.uso.entrada} tokens de entrada, ${c.uso.saida} de saída` : "sem uso informado"}
                {c.uso?.raciocinio != null ? ` (${c.uso.raciocinio} de raciocínio)` : ""} · {c.ms} ms
                {c.zodOk ? "" : " · formato inválido"}
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="rounded-md border border-zinc-300 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-marca">
          O que o modelo viu
        </summary>
        <p className="mt-2 text-xs text-zinc-700">
          Mensagem mascarada no seu navegador com a mesma função do servidor. A API não devolve a mensagem.
        </p>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-zinc-100 px-3 py-2 font-mono text-xs">
          {oQueOModeloViu(mensagemEnviada)}
        </pre>
      </details>
    </div>
  );
}

export function Resultado({ estado }: { estado: Estado }) {
  const titulo = useRef<HTMLHeadingElement>(null);

  // Leva o foco ao resultado quando ele chega (útil para leitor de tela e teclado).
  useEffect(() => {
    if (estado.tipo === "ok" || estado.tipo === "erro" || estado.tipo === "limite") titulo.current?.focus();
  }, [estado]);

  return (
    <section
      aria-live="polite"
      aria-busy={estado.tipo === "carregando"}
      className="rounded-lg border border-zinc-300 bg-white p-4 sm:p-6"
    >
      <h2 ref={titulo} tabIndex={-1} className="text-base font-semibold focus:outline-none">
        Resultado
      </h2>

      <div className="mt-3">
        {estado.tipo === "ocioso" && (
          <p className="text-sm text-zinc-700">Escolha um exemplo ou escreva uma mensagem e clique em Analisar.</p>
        )}

        {estado.tipo === "carregando" && (
          <p className="flex items-center gap-2 text-sm text-zinc-800">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-marca"
            />
            Analisando a mensagem: classificação e, se for o caso, redação…
          </p>
        )}

        {estado.tipo === "erro" && (
          <p role="alert" className="rounded-md border border-red-700 bg-red-50 px-3 py-2 text-sm text-red-950">
            {estado.texto}
          </p>
        )}

        {estado.tipo === "limite" && (
          <p role="status" className="rounded-md border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <strong>Limite da demonstração atingido</strong> ({rotuloLimite(estado.limite)}).{" "}
            {horaBrasilia(estado.reiniciaEm)
              ? `Tente de novo a partir de ${horaBrasilia(estado.reiniciaEm)} (horário de Brasília).`
              : "Tente de novo mais tarde."}
          </p>
        )}

        {estado.tipo === "ok" && <Detalhes r={estado.resultado} ms={estado.ms} mensagemEnviada={estado.mensagemEnviada} />}
      </div>
    </section>
  );
}

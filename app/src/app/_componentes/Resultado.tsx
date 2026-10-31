"use client";

// Exibição do resultado e dos estados (ocioso, carregando, erro, limite, ok).
// O nível aparece com cor, símbolo e texto. A mensagem enviada só é usada para mostrar,
// no navegador, o que o modelo viu (mascarada); a API não a devolve.

import { useEffect, useRef, type ReactNode } from "react";
import type { Nivel } from "@/lib/policy";
import { AUTONOMIA, CHECAGEM, FALHA, horaBrasilia, NIVEL, oQueOModeloViu, rotuloLimite } from "@/lib/demo/apresentacao";
import type { Estado, RespostaRota } from "./Demo";

const COR_NIVEL: Record<Nivel, string> = {
  0: "border-emerald-700 bg-emerald-50 text-emerald-950",
  1: "border-amber-600 bg-amber-50 text-amber-950",
  2: "border-red-700 bg-red-50 text-red-950",
};

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">{titulo}</h3>
      <div className="mt-2 text-sm text-zinc-900">{children}</div>
    </section>
  );
}

function Detalhes({ r, ms, mensagemEnviada }: { r: RespostaRota; ms: number; mensagemEnviada: string }) {
  const nivel = NIVEL[r.nivel];
  const outros = r.motivos.slice(1);
  return (
    <div className="space-y-4">
      <div className={`rounded-md border-2 px-4 py-3 ${COR_NIVEL[r.nivel]}`}>
        <p className="text-lg font-semibold">
          <span aria-hidden="true" className="mr-2">
            {nivel.simbolo}
          </span>
          {nivel.titulo}
        </p>
        <p className="mt-1 text-sm">{nivel.descricao}</p>
      </div>

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
        <dt className="font-medium text-zinc-700">Tópico de política</dt>
        <dd className="font-mono">{r.topico ?? "nenhum"}</dd>
        <dt className="font-medium text-zinc-700">Confiança</dt>
        <dd>{r.confianca === null ? "não disponível" : r.confianca.toFixed(2)}</dd>
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
          <blockquote className="whitespace-pre-wrap rounded-md border-l-4 border-blue-700 bg-blue-50 px-3 py-2 text-zinc-900">
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
          <p>Não se aplica: no nível 2 não há texto ao cliente.</p>
        ) : r.checagem.ok ? (
          <p>
            <span aria-hidden="true">✓ </span>Aprovado: sem números sem fonte, promessas, pedido de dados sensíveis ou
            links estranhos.
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {r.checagem.falhas.map((f) => (
              <li key={f}>Reprovado: {CHECAGEM[f] ?? f}</li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco titulo="Telemetria">
        <p>
          Tempo total: {ms} ms{r.modelo ? ` · modelo ${r.modelo}` : ""}
        </p>
        {r.chamadas.length > 0 && (
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {r.chamadas.map((c, i) => (
              <li key={i}>
                {c.nome}: {c.uso ? `${c.uso.entrada} tokens de entrada, ${c.uso.saida} de saída` : "sem uso informado"}
                {c.uso?.raciocinio != null ? ` (${c.uso.raciocinio} de raciocínio)` : ""} · {c.ms} ms
                {c.zodOk ? "" : " · formato inválido"}
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <details className="rounded-md border border-zinc-300 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
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
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-blue-700"
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

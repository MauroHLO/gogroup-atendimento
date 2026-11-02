// Identidade visual dos níveis: símbolo escuro em chip colorido, nunca só a cor nem texto na cor da série.
// Os nomes de classe ficam escritos por inteiro para o Tailwind encontrá-los.

import { NIVEL } from "@/lib/demo/apresentacao";
import type { Nivel } from "@/lib/policy";

export const FUNDO_NIVEL: Record<Nivel, string> = { 0: "bg-nivel-0", 1: "bg-nivel-1", 2: "bg-nivel-2" };
export const FUNDO_CLARO_NIVEL: Record<Nivel, string> = { 0: "bg-nivel-0-claro", 1: "bg-nivel-1-claro", 2: "bg-nivel-2-claro" };
export const BORDA_NIVEL: Record<Nivel, string> = { 0: "border-nivel-0", 1: "border-nivel-1", 2: "border-nivel-2" };

export function SimboloNivel({ nivel, tamanho = "normal" }: { nivel: Nivel; tamanho?: "normal" | "grande" }) {
  const medida = tamanho === "grande" ? "h-10 w-10 text-xl" : "h-5 w-5 text-xs";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none text-zinc-950 ${medida} ${FUNDO_NIVEL[nivel]}`}
    >
      {NIVEL[nivel].simbolo}
    </span>
  );
}

// Símbolo e rótulo juntos: legenda dos gráficos e primeira coluna das tabelas.
export function RotuloNivel({ nivel }: { nivel: Nivel }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900">
      <SimboloNivel nivel={nivel} />
      Nível {nivel}
    </span>
  );
}

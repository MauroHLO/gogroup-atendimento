import Image from "next/image";
import { PRINCIPIO } from "@/lib/impacto";
import { Cartoes } from "./_componentes/Cartoes";
import { Demo } from "./_componentes/Demo";
import { Impacto } from "./_componentes/Impacto";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-marca pb-3">
          <Image src="/gogroup-logo.png" alt="GoGroup" width={98} height={28} />
          <p className="text-sm text-zinc-700">Projeto do Desafio AI-First. Não é um produto oficial da GoGroup.</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-marca sm:text-3xl">Agente de atendimento: Gocase e GoBeaute</h1>
        <p className="text-lg font-medium text-zinc-900">{PRINCIPIO}</p>
        <Cartoes />
        <p
          role="note"
          className="rounded-md border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
        >
          Dados fictícios: não digite dados reais (nome, CPF, telefone, e-mail, cartão). A mensagem é mascarada e vai ao
          provedor do modelo (Groq), sem ser guardada pela aplicação; a hospedagem registra IP e caminho, não o conteúdo.
        </p>
      </header>

      <div className="mt-6">
        <Demo />
      </div>

      <div className="mt-12">
        <Impacto />
      </div>
    </main>
  );
}

import Image from "next/image";
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
        <ul className="space-y-1 text-base text-zinc-800">
          <li>
            <strong>Problema:</strong> por que os clientes procuram o atendimento e quanto disso precisa de uma pessoa.
          </li>
          <li>
            <strong>Regra:</strong> o LLM entende e redige; o código decide o nível de autonomia.
          </li>
          <li>
            <strong>Demo:</strong> escolha um exemplo ou escreva uma mensagem e veja a decisão.
          </li>
        </ul>
        <p className="text-sm text-zinc-700">
          Dica: mude o contexto e veja o nível mudar. &ldquo;Onde está meu pedido?&rdquo; com status atrasado, ou como 3º
          contato, muda o nível.
        </p>
        <p
          role="note"
          className="rounded-md border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
        >
          Dados fictícios. Não digite dados reais (nome, CPF, telefone, e-mail, cartão). A mensagem é mascarada e
          processada pelo provedor do modelo (Groq), sem ser guardada pela aplicação; a hospedagem registra o IP e o
          caminho das requisições, não o conteúdo.
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

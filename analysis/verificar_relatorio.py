"""Confere docs/relatorio.md contra data/processed/ e lista qualquer divergência.

  python analysis/verificar_relatorio.py [--sem-testes]

Verificações:
1. Cada linha da tabela "Número → fonte" bate com a fonte, no arredondamento mostrado no relatório.
2. Todo número do corpo está na tabela (fora números estruturais: nível, seção, ordinais, datas, código, links).
3. Toda linha da tabela é usada no corpo e tem tipo válido.
4. Nenhum termo proibido (promessa de economia), id de conversa ou mensagem, nem trecho de mensagem de cliente
   (este último só se data/interim/avaliacao/entrada.jsonl existir; ele fica fora do Git).

Sai com código 1 se houver divergência. Só imprime números, chaves e o termo encontrado; nunca o texto de uma
mensagem.
"""

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
RELATORIO = BASE / "docs" / "relatorio.md"
PROCESSED = BASE / "data" / "processed"
TIPOS = {"M", "E", "H", "A", "R"}
TERMOS_PROIBIDOS = ["garantid", "com certeza", "certamente", "sem risco", "vai economizar", "economia de r$", "economizará"]
RE_ID = re.compile(r"\b(CV\d{5,}|M\d{6,})\b")
RE_NUMERO = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)*")
TITULO_TABELA = "### Número → fonte"


def para_float(texto: str) -> float:
    return float(texto.replace(".", "").replace(",", "."))


def casas(texto: str) -> int:
    return len(texto.split(",")[1]) if "," in texto else 0


def valor_na_fonte(fonte: str):
    arquivo, chave = fonte.split("#", 1)
    caminho = PROCESSED / arquivo
    if arquivo.endswith(".json"):
        atual = json.loads(caminho.read_text(encoding="utf-8"))
        for parte in chave.split("."):
            atual = atual[parte]
        return float(atual)
    linha, coluna = chave.rsplit(".", 1)
    with open(caminho, encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        primeira = leitor.fieldnames[0]
        for registro in leitor:
            if registro[primeira] == linha:
                return float(registro[coluna])
    raise KeyError(chave)


def contagem_de_testes() -> int:
    with tempfile.TemporaryDirectory() as pasta:
        saida = Path(pasta) / "vitest.json"
        subprocess.run(f'npx vitest run --reporter=json --outputFile="{saida}"', cwd=BASE / "app", shell=True, capture_output=True)
        return json.loads(saida.read_text(encoding="utf-8"))["numTotalTests"]


def conferir_tabela(linhas: list[tuple[str, str, str]], rodar_testes: bool) -> list[str]:
    erros = []
    testes = None
    for numero, fonte, tipo in linhas:
        if tipo not in TIPOS:
            erros.append(f"tipo inválido: {numero} ({tipo})")
        esperado = para_float(numero)
        try:
            if fonte == "vitest":
                if rodar_testes:
                    testes = testes if testes is not None else contagem_de_testes()
                    if testes != esperado:
                        erros.append(f"{numero}: vitest conta {testes}")
            elif fonte.startswith("doc:"):
                doc = (BASE / fonte[4:]).read_text(encoding="utf-8")
                if not re.search(rf"(?<![\d.,]){re.escape(numero)}(?![\d])", doc):
                    erros.append(f"{numero}: não aparece em {fonte[4:]}")
            else:
                obtido = round(valor_na_fonte(fonte), casas(numero))
                if abs(obtido - esperado) > 1e-9:
                    erros.append(f"{numero}: a fonte {fonte} dá {obtido}")
        except (KeyError, FileNotFoundError, TypeError, ValueError) as e:
            erros.append(f"{numero}: fonte {fonte} ilegível ({type(e).__name__})")
    return erros


def limpar_corpo(corpo: str) -> str:
    """Tira o que não é número de conteúdo: código, links e contextos estruturais."""
    t = re.sub(r"```.*?```", " ", corpo, flags=re.S)
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"\]\([^)]*\)", "] ", t)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"^#+\s*\d+\.", " ", t, flags=re.M)  # títulos numerados
    t = re.sub(r"^\d+\.\s", " ", t, flags=re.M)  # listas numeradas
    t = re.sub(r"^\| [012] \|", "|", t, flags=re.M)  # coluna de nível
    t = re.sub(r"^\| \d \| (?=[A-Z\"])", "| ", t, flags=re.M)  # coluna # dos defeitos
    t = re.sub(r"\d{2}/\d{2}/\d{4}", " ", t)  # datas
    t = re.sub(r"\b\d+º", " ", t)  # ordinais (regra de contato)
    t = re.sub(r"[Nn]íve(l|is)\s+\d(\s+(ou|e)\s+\d)?", " ", t)
    t = re.sub(r"[Ss]eç(ão|ões)\s+\d+", " ", t)
    t = re.sub(r"defeitos \d e \d", " ", t)
    t = re.sub(r"1 em cada 3|× 3", " ", t)  # definição da amostra
    t = re.sub(r"IC 95%", "IC", t)
    t = re.sub(r"Problema 1\b", " ", t)
    t = re.sub(r"\d+h\b", " ", t)  # horário comercial (8h às 20h)
    return t


def normalizar(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in t if not unicodedata.combining(c))).split())


def conferir_texto_de_cliente(texto: str) -> int:
    entrada = BASE / "data" / "interim" / "avaliacao" / "entrada.jsonl"
    if not entrada.exists():
        print("aviso: entrada.jsonl ausente; trecho de mensagem não conferido")
        return 0
    alvo = normalizar(texto)
    achados = 0
    for linha in open(entrada, encoding="utf-8"):
        palavras = normalizar(json.loads(linha).get("texto", "")).split()
        achados += sum(" ".join(palavras[i:i + 6]) in alvo for i in range(max(0, len(palavras) - 5)))
    return achados


def main() -> int:
    rodar_testes = "--sem-testes" not in sys.argv
    texto = RELATORIO.read_text(encoding="utf-8")
    corpo, _, apendice = texto.partition(TITULO_TABELA)
    linhas = []
    for l in apendice.splitlines():
        m = re.match(r"^\| ([\d.,]+) \| `([^`]+)` \| (\w+) \|$", l)
        if m:
            linhas.append(m.groups())

    erros = conferir_tabela(linhas, rodar_testes)

    limpo = limpar_corpo(corpo)
    no_corpo = RE_NUMERO.findall(limpo)
    tabela = {n for n, _, _ in linhas}
    # O corpo mostra 72%, 100%, 3,0% etc.; a tabela guarda o número exatamente como aparece no corpo.
    sem_fonte = sorted(set(no_corpo) - tabela, key=para_float)
    nao_usados = sorted(tabela - set(no_corpo), key=para_float)
    erros += [f"número sem fonte no corpo: {n}" for n in sem_fonte]
    erros += [f"linha da tabela não usada no corpo: {n}" for n in nao_usados]

    baixo = texto.lower()
    erros += [f"termo proibido: {t}" for t in TERMOS_PROIBIDOS if t in baixo]
    erros += [f"possível id de conversa ou mensagem: {m}" for m in RE_ID.findall(texto)]
    trechos = conferir_texto_de_cliente(texto)
    if trechos:
        erros.append(f"trechos de mensagem de cliente no relatório: {trechos}")

    print(f"linhas da tabela: {len(linhas)} | números distintos no corpo: {len(set(no_corpo))} | trechos de cliente: {trechos}")
    for e in erros:
        print("DIVERGÊNCIA:", e)
    print("OK: nenhuma divergência" if not erros else f"{len(erros)} divergência(s)")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())

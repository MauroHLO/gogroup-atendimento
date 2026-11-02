"""Gera as figuras de docs/img/ a partir de data/processed/, como SVG escrito à mão (só biblioteca padrão).

  python analysis/graficos.py

Cada número desenhado vem de arquivo; nenhum é digitado aqui. Rodar de novo com os mesmos dados dá os mesmos bytes.
Cada SVG traz fundo claro próprio (para ler bem no tema escuro do GitHub), <title>, <desc> e a fonte do dado.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from xml.sax.saxutils import escape

BASE = Path(__file__).resolve().parent.parent
PROCESSED = BASE / "data" / "processed"
SAIDA = BASE / "docs" / "img"

LARGURA = 720
MARGEM = 24
FONTE = "'Segoe UI', Helvetica, Arial, sans-serif"
TINTA = "#27272a"
TINTA_FORTE = "#111111"  # rótulo dentro de segmento colorido: passa AA nas três cores de nível
SUAVE = "#52525b"
GRADE = "#d4d4d8"
FUNDO = "#fbfbfa"
MARCA = "#1a5da8"
AZUL = "#2a78d6"
LARANJA = "#eb6834"
NIVEIS = {"0": ("#1baf7a", "circulo"), "1": ("#eda100", "losango"), "2": ("#e34948", "triangulo")}
ROTULO_CANAL = {"reclame_aqui": "Reclame Aqui", "whatsapp": "WhatsApp", "email": "E-mail"}
ROTULO_MOTIVO = {
    "atraso": "Atraso",
    "rastreio": "Rastreio",
    "financeiro_cobranca": "Cobrança",
    "avaria": "Avaria",
    "sem_mensagem_cliente": "Sem mensagem do cliente",
    "item_faltando": "Item faltando",
    "cancelamento": "Cancelamento",
    "duvida_produto": "Dúvida de produto",
    "brinde": "Brinde",
    "troca_tamanho": "Troca de tamanho",
    "personalizacao_erro": "Erro de personalização",
    "promo_cupom": "Promoção e cupom",
    "fragrancia": "Fragrância",
    "endereco": "Endereço",
    "pagamento_pendente": "Pagamento pendente",
    "elogio": "Elogio",
    "reacao_adversa": "Reação adversa",
    "nao_classificado": "Não classificado",
}


def num(valor: float, casas: int = 0) -> str:
    """Número em pt-BR: 8294.4 → 8.294; 8.49 com casas=2 → 8,49."""
    return f"{valor:,.{casas}f}".replace(",", "_").replace(".", ",").replace("_", ".")


def pct(valor: float) -> str:
    return f"{num(valor, 1)}%"


def ler_csv(nome: str) -> list[dict[str, str]]:
    with open(PROCESSED / nome, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def ler_json(nome: str) -> dict:
    return json.loads((PROCESSED / nome).read_text(encoding="utf-8"))


def luminancia(cor: str) -> float:
    canais = [int(cor[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in canais]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a: str, b: str) -> float:
    claro, escuro = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (claro + 0.05) / (escuro + 0.05)


def texto(x, y, conteudo, tam=13, cor=TINTA, peso="400", ancora="start") -> str:
    return (
        f'<text x="{x:g}" y="{y:g}" font-size="{tam}" fill="{cor}" font-weight="{peso}" '
        f'text-anchor="{ancora}">{escape(str(conteudo))}</text>'
    )


def barra(x, y, l, a, cor, rx=3, extra="") -> str:
    return f'<rect x="{x:g}" y="{y:g}" width="{max(l, 0.5):g}" height="{a:g}" rx="{rx}" fill="{cor}" {extra}/>'


def simbolo(forma: str, x, y, cor, r=6) -> str:
    """Forma do nível: identidade não depende só da cor."""
    if forma == "circulo":
        return f'<circle cx="{x:g}" cy="{y:g}" r="{r}" fill="{cor}"/>'
    if forma == "losango":
        return f'<path d="M{x:g} {y - r - 1:g}L{x + r + 1:g} {y:g}L{x:g} {y + r + 1:g}L{x - r - 1:g} {y:g}Z" fill="{cor}"/>'
    return f'<path d="M{x:g} {y - r - 1:g}L{x + r + 1:g} {y + r:g}L{x - r - 1:g} {y + r:g}Z" fill="{cor}"/>'


def seta(x1, y1, x2, y2, cor, largura=2) -> str:
    """Linha reta com ponta, em y ou x; a ponta é desenhada à parte para herdar a cor."""
    p = 6
    if x1 == x2:
        s = 1 if y2 > y1 else -1
        ponta = f"M{x2:g} {y2:g}L{x2 - p:g} {y2 - s * p * 1.4:g}L{x2 + p:g} {y2 - s * p * 1.4:g}Z"
        fim = f"{x2:g} {y2 - s * p:g}"
    else:
        s = 1 if x2 > x1 else -1
        ponta = f"M{x2:g} {y2:g}L{x2 - s * p * 1.4:g} {y2 - p:g}L{x2 - s * p * 1.4:g} {y2 + p:g}Z"
        fim = f"{x2 - s * p:g} {y2:g}"
    return f'<path d="M{x1:g} {y1:g}L{fim}" stroke="{cor}" stroke-width="{largura}" fill="none"/><path d="{ponta}" fill="{cor}"/>'


def hachura(ident: str, cor: str) -> str:
    return (
        f'<pattern id="{ident}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        f'<rect width="8" height="8" fill="#ffffff"/><rect width="4" height="8" fill="{cor}"/></pattern>'
    )


def svg(nome: str, altura: int, titulo: str, subtitulo: str, desc: str, fonte: str, corpo: list[str], defs: str = "") -> None:
    partes = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{LARGURA}" height="{altura}" viewBox="0 0 {LARGURA} {altura}" '
        f'role="img" aria-labelledby="t d" font-family="{FONTE}">',
        f'<title id="t">{escape(titulo)}</title>',
        f'<desc id="d">{escape(desc)}</desc>',
    ]
    if defs:
        partes.append(f"<defs>{defs}</defs>")
    partes += [
        f'<rect x="0.5" y="0.5" width="{LARGURA - 1}" height="{altura - 1}" rx="12" fill="{FUNDO}" stroke="{GRADE}"/>',
        texto(MARGEM, 34, titulo, 19, TINTA_FORTE, "600"),
        texto(MARGEM, 56, subtitulo, 13.5, SUAVE),
        *corpo,
        texto(MARGEM, altura - 16, f"Fonte: {fonte}", 11.5, SUAVE),
        "</svg>",
    ]
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / nome).write_text("\n".join(partes) + "\n", encoding="utf-8", newline="\n")


def figura_niveis() -> None:
    linhas = {l["nivel"]: l for l in ler_csv("autonomia.csv")}
    cen = ler_json("cenarios.json")["base_de_custo"]
    for cor, _ in NIVEIS.values():
        assert contraste(TINTA_FORTE, cor) >= 4.5, cor
    x0, l_total, gap = MARGEM, LARGURA - 2 * MARGEM, 2
    corpo = []
    lx = x0
    for n, (cor, forma) in NIVEIS.items():
        corpo.append(simbolo(forma, lx + 7, 80, cor))
        corpo.append(texto(lx + 20, 85, f"Nível {n}", 13, TINTA, "600"))
        lx += 92
    for i, (campo, rotulo) in enumerate((("pct_conversas", "% das conversas [M]"), ("pct_custo", "% do custo [E]"))):
        y = 116 + i * 82
        corpo.append(texto(x0, y - 8, rotulo, 13.5, TINTA, "600"))
        x = x0
        soma = sum(float(linhas[n][campo]) for n in NIVEIS)
        util = l_total - gap * (len(NIVEIS) - 1)
        for n, (cor, _) in NIVEIS.items():
            v = float(linhas[n][campo])
            largura = util * v / soma
            corpo.append(barra(x, y, largura, 46, cor, 4))
            corpo.append(texto(x + largura / 2, y + 29, pct(v), 15, TINTA_FORTE, "700", "middle"))
            x += largura + gap
    corpo.append(
        texto(
            x0, 276,
            f"Base: {num(cen['conversas_simuladas_amostra'])} conversas simuladas e R$ {num(cen['custo_simulado_rs'])} de custo.",
            12.5, SUAVE,
        )
    )
    n0, n1, n2 = (linhas[n] for n in NIVEIS)
    desc = (
        "Duas barras empilhadas a 100%. Conversas: "
        f"nível 0 {pct(float(n0['pct_conversas']))}, nível 1 {pct(float(n1['pct_conversas']))}, nível 2 {pct(float(n2['pct_conversas']))}. "
        f"Custo: nível 0 {pct(float(n0['pct_custo']))}, nível 1 {pct(float(n1['pct_custo']))}, nível 2 {pct(float(n2['pct_custo']))}."
    )
    svg(
        "conversas-vs-custo.svg", 318, "Conversas vs custo por nível",
        f"O nível 2 tem {pct(float(n2['pct_conversas']))} das conversas e {pct(float(n2['pct_custo']))} do custo.",
        desc, "data/processed/autonomia.csv e cenarios.json", corpo,
    )


def figura_canais() -> None:
    linhas = sorted(ler_csv("canais_custos.csv"), key=lambda l: -float(l["pct_custo"]))
    ra = next(l for l in linhas if l["canal"] == "reclame_aqui")
    x0, x1 = 130, LARGURA - 70
    escala = (x1 - x0) / 80
    corpo = []
    for cor, rot, lx in ((AZUL, "% das conversas [M]", MARGEM), (LARANJA, "% do custo [E]", MARGEM + 168)):
        corpo.append(barra(lx, 73, 14, 14, cor))
        corpo.append(texto(lx + 20, 85, rot, 13))
    y = 104
    alt = 22
    for l in linhas:
        destaque = l["canal"] == "reclame_aqui"
        if destaque:
            corpo.append(barra(MARGEM - 8, y - 8, LARGURA - 2 * MARGEM + 16, 2 * alt + 18, "#eef2f7", 6))
        corpo.append(texto(MARGEM, y + alt + 5, ROTULO_CANAL[l["canal"]], 14, TINTA_FORTE, "600" if destaque else "400"))
        for i, (campo, cor) in enumerate((("pct_conversas", AZUL), ("pct_custo", LARANJA))):
            v = float(l[campo])
            yb = y + i * (alt + 2)
            corpo.append(barra(x0, yb, v * escala, alt, cor))
            corpo.append(texto(x0 + v * escala + 6, yb + 16, pct(v), 13, TINTA_FORTE, "700" if destaque else "400"))
        y += 2 * alt + 26
    desc = "Barras agrupadas por canal. " + " ".join(
        f"{ROTULO_CANAL[l['canal']]}: {pct(float(l['pct_conversas']))} das conversas e {pct(float(l['pct_custo']))} do custo."
        for l in linhas
    )
    svg(
        "canais.svg", y + 28, "Canais: conversas vs custo",
        f"O Reclame Aqui tem {pct(float(ra['pct_conversas']))} das conversas e {pct(float(ra['pct_custo']))} do custo.",
        desc, "data/processed/canais_custos.csv", corpo,
    )


def figura_motivos() -> None:
    linhas = sorted(ler_csv("motivos_custos.csv"), key=lambda l: -float(l["pct_custo"]))
    soma = ler_json("cenarios.json")["derivados"]["atraso_mais_rastreio_pct"]
    x0, x1 = 190, LARGURA - 70
    escala = (x1 - x0) / max(float(l["pct_custo"]) for l in linhas)
    corpo = []
    y = 72
    alt = 16
    for l in linhas:
        destaque = l["motivo"] in ("atraso", "rastreio")
        v = float(l["pct_custo"])
        corpo.append(texto(MARGEM, y + 12.5, ROTULO_MOTIVO[l["motivo"]], 13, TINTA_FORTE if destaque else TINTA, "700" if destaque else "400"))
        corpo.append(barra(x0, y, v * escala, alt, AZUL, 3, "" if destaque else 'fill-opacity="0.4"'))
        corpo.append(texto(x0 + v * escala + 6, y + 12.5, pct(v), 12.5, TINTA_FORTE if destaque else SUAVE, "700" if destaque else "400"))
        y += alt + 6
    desc = "Barras horizontais ordenadas por percentual do custo. " + "; ".join(
        f"{ROTULO_MOTIVO[l['motivo']]} {pct(float(l['pct_custo']))}" for l in linhas
    ) + "."
    svg(
        "custo-por-motivo.svg", y + 32, "Custo por motivo [E]",
        f"Atraso e rastreio somam {pct(soma)} do custo.",
        desc, "data/processed/motivos_custos.csv", corpo,
    )


def figura_impacto() -> None:
    c = ler_json("cenarios.json")
    teto = c["teto_nivel_0"]["rs"]
    baixo = c["nivel_1"]["cenarios"]["conservador"]["rs"]
    alto = c["nivel_1"]["cenarios"]["base"]["rs"]
    base = c["custo_do_agente"]["base"]["total_rs"]
    pess = c["custo_do_agente"]["pessimista"]["total_rs"]
    verde, ambar = NIVEIS["0"][0], NIVEIS["1"][0]
    x0, x1 = 150, LARGURA - MARGEM - 8
    corpo = [
        barra(MARGEM, 73, 22, 14, "#71717a"),
        barra(MARGEM + 170, 73, 22, 14, "url(#h-cinza)", 3, 'stroke="#71717a"'),
        texto(MARGEM + 28, 85, "sólido = estimado", 13),
        texto(MARGEM + 198, 85, "hachurado = hipótese", 13),
    ]

    def eixo(y, passos, maximo, prefixo_casas=0):
        partes = []
        for v in passos:
            x = x0 + (x1 - x0) * v / maximo
            partes.append(f'<path d="M{x:g} {y:g}V{y + 5}" stroke="{GRADE}"/>')
            partes.append(texto(x, y + 19, f"R$ {num(v, prefixo_casas)}", 11.5, SUAVE, "400", "middle"))
        partes.append(f'<path d="M{x0} {y:g}H{x1}" stroke="{GRADE}"/>')
        return partes

    maximo = 10000
    esc = (x1 - x0) / maximo
    corpo.append(texto(x0, 122, f"R$ {num(teto)} [E]", 13.5, TINTA_FORTE, "700"))
    corpo.append(texto(MARGEM, 147, "Teto do nível 0", 13.5, TINTA_FORTE, "600"))
    corpo.append(barra(x0, 130, teto * esc, 26, verde))
    corpo.append(texto(x0 + baixo * esc, 182, f"R$ {num(baixo)} a R$ {num(alto)} [H]", 13.5, TINTA_FORTE, "700"))
    corpo.append(texto(MARGEM, 207, "Nível 1", 13.5, TINTA_FORTE, "600"))
    corpo.append(barra(x0 + baixo * esc, 190, (alto - baixo) * esc, 26, "url(#h-ambar)", 3, f'stroke="{ambar}"'))
    corpo += eixo(228, (0, 2500, 5000, 7500, 10000), maximo)

    corpo.append(barra(MARGEM - 8, 266, LARGURA - 2 * MARGEM + 16, 118, "#f1f1ef", 8))
    corpo.append(texto(MARGEM, 288, "Custo do modelo: painel à parte, com escala própria (reais, não milhares)", 13, TINTA, "600"))
    maximo2 = 30
    esc2 = (x1 - x0) / maximo2
    corpo.append(texto(x0, 312, f"R$ {num(base, 2)} [R] a R$ {num(pess, 2)} [H]", 13.5, TINTA_FORTE, "700"))
    corpo.append(texto(MARGEM, 337, "Custo do modelo", 13.5, TINTA_FORTE, "600"))
    corpo.append(barra(x0, 320, base * esc2, 26, AZUL))
    corpo.append(barra(x0 + base * esc2 + 2, 320, (pess - base) * esc2 - 2, 26, "url(#h-azul)", 3, f'stroke="{AZUL}"'))
    corpo += eixo(350, (0, 10, 20, 30), maximo2)

    corpo.append(texto(MARGEM, 404, "Os itens não devem ser somados. Nada aqui é economia medida: o agente não rodou em produção.", 12.5, SUAVE))
    desc = (
        f"Teto do nível 0: R$ {num(teto)}, estimado, barra sólida. Nível 1: R$ {num(baixo)} a R$ {num(alto)}, hipótese, barra hachurada. "
        f"Em painel à parte, com escala própria, custo do modelo: R$ {num(base, 2)} no caso base (registro) a R$ {num(pess, 2)} no caso pessimista (hipótese)."
    )
    defs = hachura("h-cinza", "#71717a") + hachura("h-ambar", ambar) + hachura("h-azul", AZUL)
    svg(
        "impacto-em-reais.svg", 446, "Impacto em R$: teto, cenários e custo do modelo",
        "Valores no período da amostra. O custo do modelo é minúsculo perto dos outros dois.",
        desc, "data/processed/cenarios.json", corpo, defs,
    )


def figura_pipeline() -> None:
    v0, v1, v2 = (NIVEIS[n][0] for n in "012")

    def caixa(x, y, l, a, nome, quem, borda=MARCA):
        return [
            f'<rect x="{x:g}" y="{y:g}" width="{l:g}" height="{a:g}" rx="8" fill="#ffffff" stroke="{borda}" stroke-width="2"/>',
            texto(x + l / 2, y + a / 2 - 1, nome, 14, TINTA_FORTE, "600", "middle"),
            texto(x + l / 2, y + a / 2 + 15, quem, 11.5, SUAVE, "400", "middle"),
        ]

    # Colunas dos três caminhos.
    cols = [MARGEM, 256, 488]
    lc = 208
    centro = [c + lc / 2 for c in cols]
    corpo = []
    # Linha 1: entrada até os sinais.
    lb = 208
    for x, nome, quem in zip(cols, ("Mascarar", "Classificar", "Sinais"), ("código", "LLM, JSON validado", "palavra-chave e LLM")):
        corpo += caixa(x, 72, lb, 52, nome, quem)
    corpo.append(seta(cols[0] + lb, 98, cols[1] - 1, 98, MARCA))
    corpo.append(seta(cols[1] + lb, 98, cols[2] - 1, 98, MARCA))
    # Regra de nível: barra larga, de onde saem os três caminhos.
    corpo.append(seta(centro[2], 124, centro[2], 149, MARCA))
    corpo += caixa(MARGEM, 150, LARGURA - 2 * MARGEM, 52, "Regra de nível", "código determinístico, com testes")
    # Cabeçalhos dos caminhos.
    cores = (v0, v1, v2)
    for i, (n, (cor, forma)) in enumerate(NIVEIS.items()):
        corpo.append(seta(centro[i], 202, centro[i], 228, cor, 3))
        corpo.append(simbolo(forma, centro[i] - 32, 246, cor))
        corpo.append(texto(centro[i] - 20, 251, f"Nível {n}", 14, TINTA_FORTE, "700"))
    # Redigir e checar são compartilhados pelos níveis 0 e 1.
    larga = cols[1] + lc - cols[0]
    for i in (0, 1):
        corpo.append(seta(centro[i], 260, centro[i], 283, cores[i], 3))
    corpo += caixa(cols[0], 284, larga, 50, "Redigir", "LLM, só com FAQ e fatos do pedido")
    for i in (0, 1):
        corpo.append(seta(centro[i], 334, centro[i], 355, cores[i], 3))
    corpo += caixa(cols[0], 356, larga, 50, "Checar", "código: número, promessa, prazo, CPF")
    for i in (0, 1):
        corpo.append(seta(centro[i], 406, centro[i], 427, cores[i], 3))
    corpo.append(seta(centro[2], 260, centro[2], 427, v2, 3))
    corpo.append(f'<rect x="{cols[2] + 16}" y="318" width="{lc - 32}" height="20" fill="{FUNDO}"/>')
    corpo.append(texto(centro[2], 332, "sem redação do LLM", 12.5, SUAVE, "400", "middle"))
    # Desfechos.
    desfechos = (
        (v0, "Responde ao cliente", "sem pessoa no fluxo"),
        (v1, "Rascunho", "uma pessoa aprova"),
        (v2, "Resumo interno", "humano obrigatório"),
    )
    for i, (cor, nome, quem) in enumerate(desfechos):
        corpo += caixa(cols[i], 428, lc, 50, nome, quem, cor)
    corpo.append(texto(MARGEM, 500, "Reprovou duas vezes na checagem: texto de reserva, e o nível 0 passa a nível 1.", 12.5, SUAVE))
    corpo.append(texto(MARGEM, 518, "Falha do provedor: nível 2. Nada é executado em sistema real.", 12.5, SUAVE))
    desc = (
        "Fluxo: mascarar, classificar, sinais, regra de nível. A regra abre três caminhos. Nível 0: redigir, checar, responde ao cliente. "
        "Nível 1: redigir, checar, rascunho que uma pessoa aprova. Nível 2: sem redação do LLM, resumo interno e humano obrigatório."
    )
    svg(
        "pipeline.svg", 560, "Pipeline do agente: o LLM entende e redige, o código decide",
        "Três caminhos saem da regra de nível, cada um na cor do nível.",
        desc, "app/src/lib/agent e docs/decisoes.md, seção 14", corpo,
    )


def main() -> None:
    figura_niveis()
    figura_canais()
    figura_motivos()
    figura_impacto()
    figura_pipeline()
    for arquivo in sorted(SAIDA.glob("*.svg")):
        print(arquivo.relative_to(BASE).as_posix())


if __name__ == "__main__":
    main()

"""Avaliação do classificador (docs/decisoes.md, seção 16).

Duas etapas, com o classificador LLM rodado no meio, pelo app (app/scripts/avaliar-classificador.ts):

  python analysis/avaliacao_classificador.py amostra
      Monta a amostra estratificada e os conjuntos de sinais e grava data/interim/avaliacao/entrada.jsonl
      (FORA do Git: contém o texto das mensagens). Também roda o classificador de regras na amostra.

  cd app && npm run avaliar-classificador
      Classifica cada mensagem com o Groq (mesmo prompt e mascaramento de produção) e calcula, com o
      código do app, o nível previsto e o nível de referência. Grava data/interim/avaliacao/llm.jsonl.

  python analysis/avaliacao_classificador.py metricas
      Calcula os agregados e grava data/processed/avaliacao_*.csv e avaliacao_classificador.json
      (só contagens e percentuais; nenhum texto de mensagem). Detalhes por mensagem ficam em
      data/interim/avaliacao/detalhe.csv (fora do Git).

Referências:
1. A coluna tag_agente de conversas.csv (categoria que o agente atribuiu ao encerrar a conversa). Ela é mais
   grossa que os 19 motivos do app; a correspondência motivo -> tag é TAG_ESPERADA do analise_atendimento.py,
   estendida com os motivos que só existem no app (duvida_politica, direitos_titular, nao_classificado).
   Acerto contra a tag = o motivo previsto é coerente com a tag.
2. Rótulo de leitura (data/interim/avaliacao/rotulos.csv, fora do Git): motivos, tópico e sinais de cada
   mensagem da amostra, atribuídos lendo o texto ANTES de rodar o LLM, por um único anotador (o assistente
   de IA que escreveu este script, não uma pessoa; revisão humana parcial em revisao.csv, ver resumo_revisao).
   A tag não define o nível
   (Financeiro pode ser cobrança, nível 2, ou pagamento pendente, nível 0), por isso o nível de referência
   usa o rótulo de leitura. No conjunto de saúde, o rótulo marca os falsos positivos do regex.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analise_atendimento as A  # noqa: E402
import re  # noqa: E402

# Regex de saúde com que o conjunto de sinais da avaliação foi montado (01/11/2026), congelado para a etapa
# "amostra" continuar reproduzível. Depois disso, A.RE_SAUDE passou a exigir artigo feminino antes de
# "fórmula" (seção 16); com o regex novo, o conjunto teria 9 textos a menos (os falsos positivos).
RE_SAUDE_AVALIACAO = re.compile(
    r"gravidez|grávida|gestante|amament|bebê|minha filha|meu filho|alerg|inchad|coceira|queima|bolinhas|fórmula", re.I
)

SEED = 20261101
POR_ESTRATO = 6
SEED_REVISAO = 20261102
INTERIM = A.BASE / "data" / "interim" / "avaliacao"
OUT = A.OUT

# Motivo do app -> tags coerentes. Base: TAG_ESPERADA (analise_atendimento.py); acréscimos só do app.
TAG_COERENTE = {m: set(t) for m, t in A.TAG_ESPERADA.items()}
TAG_COERENTE["duvida_politica"] = {"Dúvida"}
TAG_COERENTE["direitos_titular"] = {"Dúvida", "Outros"}
TAG_COERENTE["nao_classificado"] = {"Outros"}

# Tag -> motivos coerentes (inverso). "Outros" não tem motivo de referência.
MOTIVOS_DA_TAG: dict[str, list[str]] = {}
for m, tags in TAG_COERENTE.items():
    for t in tags:
        MOTIVOS_DA_TAG.setdefault(t, []).append(m)
MOTIVOS_DA_TAG.pop("Outros", None)


def contexto(r) -> dict:
    return {
        "statusEntrega": r.status_entrega,
        "canal": r.canal,
        "valor": float(r.valor),
        "seq": int(r.seq),
    }


def etapa_amostra() -> None:
    conv, msg, ped = A.carregar()
    v = A.validar(conv, msg, ped)
    assert v["conversas_duplicadas"] == 0 and v["mensagens_duplicadas"] == 0, v
    df = A.montar_base(conv, msg, ped)

    # Amostra: conversas com mensagem de abertura do cliente e tag; uma por texto (mascarado) dentro de
    # cada tag, porque os dados sintéticos repetem modelos de frase; 6 por tag, seed fixa.
    base = df[df.abertura.notna() & df.tag_agente.notna()].copy()
    base["mascarada"] = base.abertura.map(A.mascarar_pii)
    base = base.drop_duplicates(subset=["tag_agente", "mascarada"])
    partes = []
    disponiveis = {}
    for tag, g in base.groupby("tag_agente", sort=True):
        disponiveis[tag] = len(g)
        partes.append(g.sample(n=min(POR_ESTRATO, len(g)), random_state=SEED))
    amostra = pd.concat(partes)

    itens = []
    for r in amostra.itertuples():
        itens.append({
            "id": f"a-{r.conversation_id}",
            "conjunto": "amostra",
            "conversation_id": r.conversation_id,
            "texto": r.abertura,
            "tag": r.tag_agente,
            "contexto": contexto(r),
            "regras": A.classificar_abertura(r.abertura),
            "saude_ref": bool(RE_SAUDE_AVALIACAO.search(r.abertura)),
            "ameaca_ref": bool(A.RE_AMEACA.search(r.abertura)),
        })

    # Sinais: TODAS as mensagens de cliente (qualquer posição) que casam com RE_SAUDE ou RE_AMEACA do
    # analise_atendimento.py; uma por texto mascarado (as repetidas dariam o mesmo resultado).
    cli = msg[msg.autor == "cliente"].copy()
    cli["mascarada"] = cli.texto.fillna("").map(A.mascarar_pii)
    ctx = df.set_index("conversation_id")
    contagem_sinais = {}
    for nome, rx in (("saude", RE_SAUDE_AVALIACAO), ("ameaca", A.RE_AMEACA)):
        s = cli[cli.texto.str.contains(rx, na=False)]
        contagem_sinais[nome] = {"mensagens": int(len(s)), "textos_unicos": int(s.mascarada.nunique()),
                                 "conversas": int(s.conversation_id.nunique())}
        for r in s.drop_duplicates(subset=["mascarada"]).itertuples():
            c = ctx.loc[r.conversation_id]
            itens.append({
                "id": f"{nome}-{r.message_id}",
                "conjunto": nome,
                "conversation_id": r.conversation_id,
                "texto": r.texto,
                "tag": c.tag_agente if isinstance(c.tag_agente, str) else None,
                "contexto": contexto(c),
                "regras": A.classificar_abertura(r.texto),
                "saude_ref": nome == "saude",
                "ameaca_ref": nome == "ameaca",
                "repeticoes": int((s.mascarada == r.mascarada).sum()),
            })

    INTERIM.mkdir(parents=True, exist_ok=True)
    with open(INTERIM / "entrada.jsonl", "w", encoding="utf-8") as f:
        for it in itens:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    meta = {"seed": SEED, "por_estrato": POR_ESTRATO, "textos_unicos_por_tag": disponiveis,
            "amostra": int(len(amostra)), "sinais": contagem_sinais}
    (INTERIM / "amostra_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    ambiguas = sorted({t for t, ms in MOTIVOS_DA_TAG.items() if len(ms) > 1})
    print("tags com mais de um motivo coerente (precisam de rótulo em rotulos.csv):", ambiguas)


# ----------------------------------------------------------------------------------------------
# Métricas
# ----------------------------------------------------------------------------------------------
def wilson(acertos: int, n: int, z: float = 1.96) -> tuple[float | None, float | None]:
    if n == 0:
        return None, None
    p = acertos / n
    den = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / den
    meia = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return round(centro - meia, 4), round(centro + meia, 4)


def coerente(motivos: list[str], tag: str) -> bool:
    return any(tag in TAG_COERENTE.get(m, set()) for m in motivos)


def taxa(acertos: int, n: int) -> dict:
    lo, hi = wilson(acertos, n)
    return {"acertos": acertos, "n": n, "pct": round(100 * acertos / n, 1) if n else None,
            "ic95_inf": None if lo is None else round(100 * lo, 1),
            "ic95_sup": None if hi is None else round(100 * hi, 1)}


def ler_rotulos() -> pd.DataFrame:
    r = pd.read_csv(INTERIM / "rotulos.csv", dtype=str).fillna("")
    r["saude"] = r.saude == "1"
    r["ameaca"] = r.ameaca == "1"
    r["ambigua"] = r.ambigua == "1"
    return r.set_index("id")


def resumo_revisao(ids_amostra: list[str]) -> dict:
    """Só contagens da revisão humana (data/interim/avaliacao/revisao.csv, fora do Git). A revisão não altera
    rotulos.csv; o bloco registra o alcance dela e confere que o sorteio se reproduz com a seed."""
    r = pd.read_csv(INTERIM / "revisao.csv", dtype=str, encoding="utf-8-sig").fillna("")
    assert r.id.is_unique and (r.veredito_humano != "").all(), "revisao.csv incompleto ou com id repetido"
    na_amostra = r[r.id.isin(ids_amostra)]
    sorteados = r[r.motivo_da_inclusao.str.startswith("sorteio")]
    fora_do_sorteio = set(na_amostra.id) - set(sorteados.id)
    populacao = pd.Series(sorted(set(ids_amostra) - fora_do_sorteio))
    sorteio = populacao.sample(len(sorteados), random_state=SEED_REVISAO)
    return {
        "itens": int(len(r)),
        "vereditos": {v: int(c) for v, c in r.veredito_humano.value_counts().items()},
        "desencontros": int(r.motivo_da_inclusao.str.contains("desencontro|saúde que o modelo").sum()),
        "sorteados": int(len(sorteados)),
        "seed_sorteio": SEED_REVISAO,
        "sorteio_reproduz": set(sorteio) == set(sorteados.id),
        "rotulos_da_amostra": len(ids_amostra),
        "rotulos_da_amostra_revisados": int(len(na_amostra)),
        "rotulos_da_amostra_nao_revisados": len(ids_amostra) - int(len(na_amostra)),
        "vereditos_na_amostra": {v: int(c) for v, c in na_amostra.veredito_humano.value_counts().items()},
        "itens_do_conjunto_de_saude": int((~r.id.isin(ids_amostra)).sum()),
    }


def etapa_metricas() -> None:
    entrada = {json.loads(l)["id"]: json.loads(l) for l in open(INTERIM / "entrada.jsonl", encoding="utf-8")}
    llm = {json.loads(l)["id"]: json.loads(l) for l in open(INTERIM / "llm.jsonl", encoding="utf-8")}
    faltam = set(entrada) - set(llm)
    assert not faltam, f"itens sem resultado do LLM: {len(faltam)}"
    rot = ler_rotulos()

    linhas = []
    for i, e in entrada.items():
        r = llm[i]
        tem_rotulo = i in rot.index
        linhas.append({
            "id": i, "conjunto": e["conjunto"], "tag": e["tag"],
            "regras_principal": e["regras"][0], "regras_todos": "|".join(e["regras"]),
            "llm_principal": r["motivoPrincipal"], "llm_todos": "|".join(r["motivos"]),
            "llm_valida": r["classificacaoValida"], "confianca": r["confianca"],
            "rotulo_todos": "|".join(r.get("motivosRef", [])), "motivo_ref": r.get("motivoRef"),
            "nivel_prev": r.get("nivelPrevisto"), "nivel_ref": r.get("nivelRef"),
            "ambigua": bool(rot.loc[i, "ambigua"]) if tem_rotulo else False,
            # Sinal de referência por regex (RE_SAUDE/RE_AMEACA do Python) e por leitura (rotulos.csv;
            # no conjunto de saúde, quem não está em rotulos.csv foi lido como saúde verdadeira).
            "saude_regex": e["saude_ref"], "ameaca_regex": e["ameaca_ref"],
            "saude_leitura": bool(rot.loc[i, "saude"]) if tem_rotulo else e["conjunto"] == "saude",
            "saude_llm": r["saudeModelo"], "ameaca_llm": r["ameacaModelo"],
            "saude_regex_app": r["saudeRegexApp"], "ameaca_regex_app": r["ameacaRegexApp"],
            "saude_final": r["saudeFinal"], "ameaca_final": r["ameacaFinal"],
            "repeticoes": e.get("repeticoes", 1),
        })
    d = pd.DataFrame(linhas)
    d.to_csv(INTERIM / "detalhe.csv", index=False)  # sem texto, mas por mensagem: fica fora do Git

    a = d[d.conjunto == "amostra"].copy()
    com_tag = a[a.tag != "Outros"].copy()  # "Outros" não corresponde a nenhum motivo
    for col, fonte in (("llm", "llm"), ("regras", "regras")):
        com_tag[f"{col}_ok"] = [coerente([p], t) for p, t in zip(com_tag[f"{fonte}_principal"], com_tag.tag)]
        com_tag[f"{col}_ok_algum"] = [coerente(m.split("|"), t) for m, t in zip(com_tag[f"{fonte}_todos"], com_tag.tag)]
    com_tag["tag_questionavel"] = [not coerente(m.split("|"), t) for m, t in zip(com_tag.rotulo_todos, com_tag.tag)]
    tq = com_tag[~com_tag.tag_questionavel]

    # Contra o rótulo de leitura (todas as 78, inclusive "Outros").
    a["llm_ok_rotulo"] = a.llm_principal == a.motivo_ref
    a["llm_ok_rotulo_algum"] = [ref in m.split("|") for ref, m in zip(a.motivo_ref, a.llm_todos)]
    a["regras_ok_rotulo"] = [ref in m.split("|")[:1] for ref, m in zip(a.motivo_ref, a.regras_todos)]
    a["regras_ok_rotulo_algum"] = [ref in m.split("|") for ref, m in zip(a.motivo_ref, a.regras_todos)]

    por_tag = []
    for tag, g in com_tag.groupby("tag", sort=True):
        por_tag.append({
            "tag": tag, "n": len(g), "tag_coerente_com_a_leitura": int((~g.tag_questionavel).sum()),
            "llm_acertos": int(g.llm_ok.sum()), "regras_acertos": int(g.regras_ok.sum()),
        })
    pd.DataFrame(por_tag).to_csv(OUT / "avaliacao_por_tag.csv", index=False)

    por_motivo = []
    for m, g in a.groupby("motivo_ref", sort=True):
        lo, hi = wilson(int(g.llm_ok_rotulo.sum()), len(g))
        por_motivo.append({
            "motivo_ref": m, "n": len(g),
            "llm_acertos": int(g.llm_ok_rotulo.sum()), "regras_acertos": int(g.regras_ok_rotulo.sum()),
            "llm_ic95": f"{round(100 * lo)}–{round(100 * hi)}%",
        })
    pd.DataFrame(por_motivo).to_csv(OUT / "avaliacao_por_motivo.csv", index=False)

    pd.crosstab(a.motivo_ref, a.llm_principal).rename_axis(index="motivo_ref", columns="llm_principal").to_csv(
        OUT / "avaliacao_confusao_llm.csv")
    pd.crosstab(a.motivo_ref, a.regras_principal).rename_axis(index="motivo_ref", columns="regras_principal").to_csv(
        OUT / "avaliacao_confusao_regras.csv")

    nv = a.dropna(subset=["nivel_prev", "nivel_ref"]).copy()
    nv["nivel_prev"] = nv.nivel_prev.astype(int)
    nv["nivel_ref"] = nv.nivel_ref.astype(int)
    abaixo = nv[nv.nivel_prev < nv.nivel_ref]
    acima = nv[nv.nivel_prev > nv.nivel_ref]
    pd.crosstab(nv.nivel_ref, nv.nivel_prev).rename_axis(index="nivel_ref", columns="nivel_previsto").to_csv(
        OUT / "avaliacao_niveis.csv")

    def recall(conj: str, col_ref: str, col: str) -> dict:
        s = d[(d.conjunto == conj) & d[col_ref]]
        return {"textos_unicos": taxa(int(s[col].sum()), len(s)),
                "mensagens": taxa(int(s.loc[s[col], "repeticoes"].sum()), int(s.repeticoes.sum()))}

    s_fp = d[(d.conjunto == "saude") & ~d.saude_leitura]  # regex do Python casou, mas a leitura diz que não é saúde
    res = {
        "seed": SEED, "por_estrato": POR_ESTRATO,
        "amostra_total": int(len(a)),
        "llm_classificacao_invalida": int((~d.llm_valida).sum()),
        "contra_tag": {
            "n": int(len(com_tag)),
            "tag_questionavel": int(com_tag.tag_questionavel.sum()),
            "llm_principal": taxa(int(com_tag.llm_ok.sum()), len(com_tag)),
            "llm_algum_motivo": taxa(int(com_tag.llm_ok_algum.sum()), len(com_tag)),
            "regras_principal": taxa(int(com_tag.regras_ok.sum()), len(com_tag)),
            "regras_algum_motivo": taxa(int(com_tag.regras_ok_algum.sum()), len(com_tag)),
            "so_tags_coerentes_com_a_leitura": {
                "n": int(len(tq)),
                "llm_principal": taxa(int(tq.llm_ok.sum()), len(tq)),
                "regras_principal": taxa(int(tq.regras_ok.sum()), len(tq)),
            },
        },
        "contra_rotulo_de_leitura": {
            "n": int(len(a)),
            "ambiguas": int(a.ambigua.sum()),
            "llm_principal": taxa(int(a.llm_ok_rotulo.sum()), len(a)),
            "llm_algum_motivo": taxa(int(a.llm_ok_rotulo_algum.sum()), len(a)),
            "regras_principal": taxa(int(a.regras_ok_rotulo.sum()), len(a)),
            "regras_algum_motivo": taxa(int(a.regras_ok_rotulo_algum.sum()), len(a)),
            "llm_e_regras_acertam": int((a.llm_ok_rotulo & a.regras_ok_rotulo).sum()),
            "so_llm_acerta": int((a.llm_ok_rotulo & ~a.regras_ok_rotulo).sum()),
            "so_regras_acertam": int((~a.llm_ok_rotulo & a.regras_ok_rotulo).sum()),
            "nenhum_acerta": int((~a.llm_ok_rotulo & ~a.regras_ok_rotulo).sum()),
        },
        "nivel": {
            "n": int(len(nv)),
            "igual": int((nv.nivel_prev == nv.nivel_ref).sum()),
            "abaixo_do_correto": int(len(abaixo)),
            "acima_do_correto": int(len(acima)),
            "abaixo_detalhe": {f"{r}->{p}": int(c) for (r, p), c in abaixo.groupby(["nivel_ref", "nivel_prev"]).size().items()},
            "acima_detalhe": {f"{r}->{p}": int(c) for (r, p), c in acima.groupby(["nivel_ref", "nivel_prev"]).size().items()},
            "pct_abaixo": taxa(int(len(abaixo)), int(len(nv))),
            "pct_acima": taxa(int(len(acima)), int(len(nv))),
        },
        "sinais": {
            "saude_regex_python": {
                "modelo": recall("saude", "saude_regex", "saude_llm"),
                "final_pipeline": recall("saude", "saude_regex", "saude_final"),
            },
            "saude_leitura": {
                "modelo": recall("saude", "saude_leitura", "saude_llm"),
                "final_pipeline": recall("saude", "saude_leitura", "saude_final"),
            },
            "saude_falso_positivo_do_regex": {
                "textos": int(len(s_fp)),
                "modelo_marcou_saude": int(s_fp.saude_llm.sum()),
                "regex_do_app_marcou_saude": int(s_fp.saude_regex_app.sum()),
                "final_marcou_saude": int(s_fp.saude_final.sum()),
            },
            "ameaca_regex_python": {
                "modelo": recall("ameaca", "ameaca_regex", "ameaca_llm"),
                "final_pipeline": recall("ameaca", "ameaca_regex", "ameaca_final"),
            },
        },
    }
    res["revisao_humana"] = resumo_revisao([i for i, e in entrada.items() if e["conjunto"] == "amostra"])
    (OUT / "avaliacao_classificador.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))
    print(pd.DataFrame(por_tag).to_string(index=False))
    print(pd.DataFrame(por_motivo).to_string(index=False))
    print(pd.crosstab(nv.nivel_ref, nv.nivel_prev))


if __name__ == "__main__":
    etapa = sys.argv[1] if len(sys.argv) > 1 else ""
    if etapa == "amostra":
        etapa_amostra()
    elif etapa == "metricas":
        etapa_metricas()
    else:
        print("uso: python analysis/avaliacao_classificador.py amostra|metricas")
        sys.exit(2)

"""Cenários de impacto em reais para docs/relatorio.md (seção 7).

Uso:
  python analysis/cenarios_impacto.py
      Lê data/processed/ e grava data/processed/cenarios.json (só agregados e premissas).

  python analysis/cenarios_impacto.py --smoke <saída de npm run smoke>
      Antes, regrava data/processed/telemetria_smoke.json com os tokens por chamada lidos da saída do smoke.
      O smoke usa 5 mensagens fictícias e não imprime a mensagem nem a resposta.

Nada aqui é economia medida: o agente não rodou em produção. O percentual de redução do tempo de tratamento,
a proporção entre custo e tempo e o multiplicador de chamadas do caso pessimista são HIPÓTESES, escritas abaixo
como parâmetros. Os valores ficam restritos ao período da amostra, sem extrapolação.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
FATOR_AMOSTRA = 3  # a amostra é de 1 em cada 3 clientes (analise_atendimento.py)

# HIPÓTESES, não dados: nenhum número da análise mede tempo de tratamento.
REDUCAO_TEMPO_NIVEL1 = {"conservador": 0.10, "base": 0.25}

# Preço do modelo, em US$ por milhão de tokens. Consulta em 01/11/2026.
PRECO_MODELO = {
    "modelo": "openai/gpt-oss-20b",
    "consulta": "2026-11-01",
    "documentacao": {"entrada": 0.075, "saida": 0.30, "fonte": "https://console.groq.com/docs/models"},
    # A tabela de https://groq.com/pricing não veio na consulta automatizada; um resultado de busca que
    # reproduz essa página trazia estes valores, possivelmente antigos. Entram só no caso pessimista.
    "referencia_alta": {"entrada": 0.10, "saida": 0.50, "fonte": "resultado de busca de groq.com/pricing, não confirmado na página"},
}

# Câmbio: PTAX de venda de 30/10/2026, API de dados abertos do Banco Central (CotacaoDolarDia).
CAMBIO = {
    "rs_por_usd": 5.4212,
    "data": "2026-10-30",
    "fonte": "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/",
}

# Caso pessimista do custo do agente: toda chamada repetida uma vez (nova tentativa ou nova redação). HIPÓTESE.
MULTIPLICADOR_CHAMADAS_PESSIMISTA = 2

RE_CHAMADA = re.compile(r"\[(classificacao|redacao)\] prompt=(\d+) completion=(\d+) raciocinio=(\d+)")


def ler_csv(nome: str) -> dict[str, dict[str, float]]:
    with open(PROCESSED / nome, encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        chave = leitor.fieldnames[0]
        return {l[chave]: {k: float(v) for k, v in l.items() if k != chave} for l in leitor}


def gravar_telemetria(caminho: str) -> None:
    chamadas = [
        {"chamada": m[1], "prompt": int(m[2]), "completion": int(m[3]), "raciocinio": int(m[4])}
        for m in RE_CHAMADA.finditer(Path(caminho).read_text(encoding="utf-8"))
    ]
    assert chamadas, "nenhuma chamada encontrada na saída do smoke"
    saida = {"origem": "npm run smoke (5 mensagens fictícias)", "data": "2026-11-01", "modelo": PRECO_MODELO["modelo"], "chamadas": chamadas}
    (PROCESSED / "telemetria_smoke.json").write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")


def media_tokens(chamadas: list[dict], nome: str) -> dict:
    linhas = [c for c in chamadas if c["chamada"] == nome]
    return {
        "chamadas_medidas": len(linhas),
        "prompt_medio": round(sum(c["prompt"] for c in linhas) / len(linhas), 1),
        "completion_medio": round(sum(c["completion"] for c in linhas) / len(linhas), 1),
        "prompt_max": max(c["prompt"] for c in linhas),
        "completion_max": max(c["completion"] for c in linhas),
    }


def custo_agente(tokens: dict, preco: dict, conversas_com_redacao: int, conversas_sem_redacao: int, multiplicador: int) -> dict:
    def por_chamada(t: dict) -> float:
        return (t["prompt_medio"] * preco["entrada"] + t["completion_medio"] * preco["saida"]) / 1_000_000

    classificacao = por_chamada(tokens["classificacao"]) * multiplicador
    redacao = por_chamada(tokens["redacao"]) * multiplicador
    com_redacao = classificacao + redacao
    total_usd = conversas_com_redacao * com_redacao + conversas_sem_redacao * classificacao
    total_rs = total_usd * CAMBIO["rs_por_usd"]
    conversas = conversas_com_redacao + conversas_sem_redacao
    return {
        "usd_por_conversa_niveis_0_1": round(com_redacao, 6),
        "usd_por_conversa_nivel_2": round(classificacao, 6),
        "total_usd": round(total_usd, 2),
        "total_rs": round(total_rs, 2),
        "rs_por_mil_conversas": round(total_rs / conversas * 1000, 2),
    }


def main() -> None:
    if "--smoke" in sys.argv:
        gravar_telemetria(sys.argv[sys.argv.index("--smoke") + 1])

    metricas = json.loads((PROCESSED / "metricas.json").read_text(encoding="utf-8"))
    autonomia = ler_csv("autonomia.csv")
    canais = ler_csv("canais_custos.csv")
    por_motivo = ler_csv("autonomia_por_motivo.csv")
    telemetria = json.loads((PROCESSED / "telemetria_smoke.json").read_text(encoding="utf-8"))

    custo_total = metricas["resumo"]["custo_estimado_populacao_rs"]
    custo_simulado = sum(n["custo_rs"] for n in autonomia.values())
    n0, n1 = autonomia["0"], autonomia["1"]
    conversas_simuladas = int(sum(n["conversas"] for n in autonomia.values()))

    tokens = {nome: media_tokens(telemetria["chamadas"], nome) for nome in ("classificacao", "redacao")}
    com_redacao = int(n0["conversas"] + n1["conversas"]) * FATOR_AMOSTRA
    sem_redacao = int(autonomia["2"]["conversas"]) * FATOR_AMOSTRA

    doc, alta = PRECO_MODELO["documentacao"], PRECO_MODELO["referencia_alta"]
    custo_base = custo_agente(tokens, doc, com_redacao, sem_redacao, 1)
    custo_pessimista = custo_agente(tokens, alta, com_redacao, sem_redacao, MULTIPLICADOR_CHAMADAS_PESSIMISTA)

    piloto = int(por_motivo["rastreio"]["0"] + por_motivo["pagamento_pendente"]["0"])

    avaliacao = json.loads((PROCESSED / "avaliacao_classificador.json").read_text(encoding="utf-8"))
    motivos = ler_csv("motivos_custos.csv")
    grupos = ler_csv("grupos_evitaveis.csv")
    revisao = avaliacao["revisao_humana"]
    conversas_amostra = metricas["validacao"]["conversas"]

    res = {
        "aviso": "Teto, cenário e hipótese. Nada aqui é economia medida; o agente não rodou em produção.",
        "base_de_custo": {
            "custo_total_rs": custo_total,
            "custo_simulado_rs": round(custo_simulado, 1),
            "custo_so_bot_rs": round(custo_total - custo_simulado, 1),
            "conversas_simuladas_amostra": conversas_simuladas,
            "conversas_simuladas_populacao": conversas_simuladas * FATOR_AMOSTRA,
        },
        "custo_por_conversa_rs": {c: round(l["custo_rs"] / (l["conversas"] * FATOR_AMOSTRA), 2) for c, l in canais.items()},
        "teto_nivel_0": {
            "rs": n0["custo_rs"],
            "pct_do_custo_simulado": round(100 * n0["custo_rs"] / custo_simulado, 1),
            "pct_do_custo_total": round(100 * n0["custo_rs"] / custo_total, 1),
        },
        "nivel_1": {
            "custo_rs": n1["custo_rs"],
            "tipo": "hipótese: redução do tempo de tratamento, com custo proporcional ao tempo",
            "rs_por_ponto_percentual": round(n1["custo_rs"] / 100, 1),
            "cenarios": {
                nome: {
                    "reducao_pct": round(100 * p),
                    "rs": round(n1["custo_rs"] * p, 1),
                    "pct_do_custo_total": round(100 * n1["custo_rs"] * p / custo_total, 1),
                }
                for nome, p in REDUCAO_TEMPO_NIVEL1.items()
            },
        },
        "nivel_2": {"custo_rs": autonomia["2"]["custo_rs"], "pct_do_custo_simulado": autonomia["2"]["pct_custo"]},
        "custo_do_agente": {
            "tokens": tokens,
            "preco": PRECO_MODELO,
            "cambio": CAMBIO,
            "conversas_com_redacao_populacao": com_redacao,
            "conversas_sem_redacao_populacao": sem_redacao,
            "base": custo_base,
            "pessimista": {"multiplicador_chamadas": MULTIPLICADOR_CHAMADAS_PESSIMISTA, **custo_pessimista},
            "pct_do_custo_total_pessimista": round(100 * custo_pessimista["total_rs"] / custo_total, 3),
            "fora_da_conta": "hospedagem, integração, monitoramento e o tempo de quem aprova ou revisa",
        },
        "derivados": {
            "atraso_mais_rastreio_pct": round(motivos["atraso"]["pct_custo"] + motivos["rastreio"]["pct_custo"], 1),
            "falha_processo_pct": round(100 * grupos["falha_de_processo"]["conversas"] / conversas_amostra, 1),
            "proativa_pct": round(100 * grupos["comunicacao_proativa_ou_autoatendimento"]["conversas"] / conversas_amostra, 1),
            "rotulos_revisados_pct": round(100 * revisao["rotulos_da_amostra_revisados"] / revisao["rotulos_da_amostra"], 1),
            "tag_ruidosa_pct": round(100 * avaliacao["contra_tag"]["tag_questionavel"] / avaliacao["contra_tag"]["n"]),
        },
        "piloto": {
            "conversas_amostra": piloto,
            "pct_das_simuladas": round(100 * piloto / conversas_simuladas, 1),
            "rastreio": int(por_motivo["rastreio"]["0"]),
            "pagamento_pendente": int(por_motivo["pagamento_pendente"]["0"]),
        },
    }
    (PROCESSED / "cenarios.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

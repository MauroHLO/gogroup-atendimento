"""
Análise de Atendimento (Gocase e GoBeauté) - Desafio AI-First GoGroup.

Uso (na raiz do repositório):
    python analysis/analise_atendimento.py

Entrada : data/raw/{conversas,mensagens,pedidos}.csv   (fora do Git)
Saídas  : data/processed/*.csv e metricas.json          (só agregados, vão para o Git)
          data/interim/conversas_classificadas.csv      (por conversa, FORA do Git)

Os números são estimativas: o motivo real é inferido por regras sobre as
mensagens do cliente. Ver docs/decisoes.md (seções 9 e 10).
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------
# Configuração
# --------------------------------------------------------------------------
BASE = Path(__file__).resolve().parents[1]
RAW = BASE / "data" / "raw"
OUT = BASE / "data" / "processed"
INTERIM = BASE / "data" / "interim"

FATOR_AMOSTRA = 3  # parametros.md: amostra de 1 em cada 3 clientes
CUSTO_CANAL = {"whatsapp": 4.80, "email": 7.20, "reclame_aqui": 42.00}  # R$/conversa
SLA_MIN = {"whatsapp": 30, "email": 24 * 60, "reclame_aqui": 48 * 60}
HORARIO = (8, 20)  # agentes atendem das 8h às 20h
LIMITE_VALOR = 200.0  # R$; cobre ~95% dos pedidos
FAQ_VALIDADA = set()  # motivos com entrada validada na FAQ (hoje nenhum)

# Mapa motivo -> tags do agente consideradas coerentes
TAG_ESPERADA = {
    "rastreio": {"Rastreio"},
    "atraso": {"Atraso"},
    "item_faltando": {"Produto faltando"},
    "brinde": {"Produto faltando"},
    "avaria": {"Avaria"},
    "personalizacao_erro": {"Avaria", "Reclamação produto", "Troca"},
    "cancelamento": {"Cancelamento"},
    "financeiro_cobranca": {"Financeiro"},
    "pagamento_pendente": {"Financeiro"},
    "endereco": {"Endereço"},
    "promo_cupom": {"Promoção"},
    "troca_tamanho": {"Troca"},
    "fragrancia": {"Reclamação produto", "Troca"},
    "duvida_produto": {"Dúvida"},
    "elogio": {"Elogio"},
    "reacao_adversa": {"Reclamação produto"},
}

# Grupos para a leitura de "contatos evitáveis" (hipótese de trabalho)
GRUPO = {
    "rastreio": "comunicacao_proativa_ou_autoatendimento",
    "pagamento_pendente": "comunicacao_proativa_ou_autoatendimento",
    "cancelamento": "comunicacao_proativa_ou_autoatendimento",
    "endereco": "comunicacao_proativa_ou_autoatendimento",
    "promo_cupom": "comunicacao_proativa_ou_autoatendimento",
    "duvida_produto": "comunicacao_proativa_ou_autoatendimento",
    "atraso": "falha_de_processo",
    "avaria": "falha_de_processo",
    "item_faltando": "falha_de_processo",
    "brinde": "falha_de_processo",
    "personalizacao_erro": "falha_de_processo",
    "reacao_adversa": "exige_pessoa",
    "financeiro_cobranca": "exige_pessoa",
    "troca_tamanho": "exige_pessoa",
    "fragrancia": "exige_pessoa",
    "elogio": "sem_acao",
    "sem_mensagem_cliente": "sem_acao",
    "nao_classificado": "sem_acao",
}

# --------------------------------------------------------------------------
# Privacidade: mascaramento (espelha o que será feito em app/lib/pii)
# --------------------------------------------------------------------------
RE_CPF = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
RE_TEL = re.compile(r"\(\d{2}\)\s?\d{4,5}-\d{4}")
RE_CARTAO = re.compile(r"\b\d{4}[ \-]\d{4}[ \-]\d{4}[ \-]\d{4}\b")
RE_EMAIL = re.compile(r"[\w.\-]+@[\w.\-]+\.\w+")


def mascarar_pii(texto: str) -> str:
    texto = RE_CARTAO.sub("[CARTAO]", texto)
    texto = RE_CPF.sub("[CPF]", texto)
    texto = RE_TEL.sub("[TELEFONE]", texto)
    return RE_EMAIL.sub("[EMAIL]", texto)


# --------------------------------------------------------------------------
# Classificador de exploração por regras (a ordem importa: vale a 1ª regra)
# --------------------------------------------------------------------------
PREFIXOS = [
    r"^Já é a \d+ª vez que entro em contato\.\s*",
    r"^De novo aqui\.\s*",
    r"^Ninguém me respondeu ainda!\s*",
]
SEPARADOR_ASSUNTO = re.compile(r"\s*(?:Ah, e também|E outra coisa:?|Aproveitando,)\s*", re.I)

REGRAS = [
    ("reacao_adversa", r"alergi|reação|reacao|irrit|vermelh|coceira|mancha na pele|passei mal|queimou|queima|ardeu|ardência|bolinhas|inchad|inchou|ferida|descam"),
    ("duvida_produto", r"validade|é vegano|pode ser usado|pode usar|aguenta queda|quanto tempo leva|quantas vezes por semana|serve pra|carregador por indução|tem espaço|qual a diferença|durabilidade|composi"),
    ("personalizacao_erro", r"escrito errado|personaliza[çc][aã]o|manchad|torta|borrad|foto .*errada|veio a de outra|iniciais|nome errado|veio escrito|veio com o nome|descascando|mudar o nome"),
    ("financeiro_cobranca", r"cobrad[oa]|cobrança|saiu duas vezes|cobrado de novo|estorno"),
    ("pagamento_pendente", r"pix|boleto"),
    ("endereco", r"endere[çc]o|número da casa|numero da casa|mudar o n[úu]mero|cep"),
    ("cancelamento", r"cancel|desisti|arrependi|comprei sem querer|dinheiro de volta"),
    ("brinde", r"brinde|mimo"),
    ("item_faltando", r"faltou|faltando|veio pela metade|comprei \d+ e chegaram|cadê o resto|chegou só o"),
    ("avaria", r"quebrad|vazand|vazou|amassad|trincad|rachad|riscos|arranhad|lacre|veio aberto|veio aberta|chegou aberto|tampa|melada|vazio"),
    ("atraso", r"atrasad|parado em|há uma semana|prazo|prometeram|estourad|venceu|não chega a tempo|nao chega a tempo|desrespeito"),
    ("rastreio", r"rastreio|status do pedido|cadê meu pedido|ainda não chegou|em trânsito|onde está"),
    ("promo_cupom", r"cupom|promoção do site|promocao do site|frete grátis|cashback|carrinho"),
    ("troca_tamanho", r"tamanho errado|modelo de celular errado|cor errada|posso trocar|trocar|devolver"),
    ("fragrancia", r"cheiro|fragr[aâ]ncia|esperava mais|muito doce|não fixa|diferente do que eu esperava|muito forte"),
    ("elogio", r"amei|agradecer|atendimento foi ótimo|melhor compra|adorei|perfeito"),
]
REGRAS_COMPILADAS = [(nome, re.compile(rx)) for nome, rx in REGRAS]


def limpar_prefixos(texto: str) -> str:
    for _ in range(3):
        for p in PREFIXOS:
            texto = re.sub(p, "", texto, flags=re.I)
    return texto.strip()


def classificar_segmento(segmento: str) -> str:
    segmento = segmento.lower()
    for nome, rx in REGRAS_COMPILADAS:
        if rx.search(segmento):
            return nome
    return "nao_classificado"


def classificar_abertura(texto) -> list:
    """Devolve a lista de motivos da mensagem de abertura (multi-rótulo)."""
    if not isinstance(texto, str) or not texto.strip():
        return ["sem_mensagem_cliente"]
    texto = mascarar_pii(limpar_prefixos(texto))
    motivos = []
    for seg in SEPARADOR_ASSUNTO.split(texto):
        if seg.strip():
            m = classificar_segmento(seg)
            if m not in motivos:
                motivos.append(m)
    return motivos or ["nao_classificado"]


# --------------------------------------------------------------------------
# Regra de autonomia (versão Python de exploração; a oficial ficará em app/lib/policy)
# --------------------------------------------------------------------------
RE_SAUDE = re.compile(r"gravidez|grávida|gestante|amament|bebê|minha filha|meu filho|alerg|inchad|coceira|queima|bolinhas|fórmula", re.I)
RE_AMEACA = re.compile(r"procon|advogad|processo judicial|justiça|abrir reclamação|reclame aqui", re.I)
NIVEL_BASE = {
    "rastreio": 0, "pagamento_pendente": 0, "elogio": 0,
    "duvida_produto": 1, "promo_cupom": 1,  # nível 0 só com FAQ validada
    "atraso": 1, "avaria": 1, "item_faltando": 1, "brinde": 1, "personalizacao_erro": 1,
    "cancelamento": 1, "troca_tamanho": 1, "fragrancia": 1, "endereco": 1,
    "reacao_adversa": 2, "financeiro_cobranca": 2, "nao_classificado": 1,
}


def nivel_motivo(motivo: str, status_entrega: str) -> int:
    if motivo in FAQ_VALIDADA:
        return 0
    if motivo == "rastreio" and status_entrega != "em_transito":
        return 1  # pedido já entregue ou parado: verificar
    if motivo == "endereco" and status_entrega in {"em_transito", "entregue", "atrasado"}:
        return 0  # recusa automática com explicação (política: só antes da separação)
    return NIVEL_BASE.get(motivo, 1)


def nivel_autonomia(r) -> int:
    motivos = [m for m in r["motivos"] if m != "sem_mensagem_cliente"]
    if not motivos:
        return -1  # sem contato do cliente: fora da regra
    nivel = max(nivel_motivo(m, r["status_entrega"]) for m in motivos)
    if r["canal"] == "reclame_aqui":
        nivel = 2
    if r["seq"] >= 2:
        nivel = max(nivel, 1)
    if r["seq"] >= 3:
        nivel = 2
    if r["valor"] > LIMITE_VALOR:
        nivel = max(nivel, 1)
    if r["saude"] or r["ameaca"]:
        nivel = 2
    return nivel


# --------------------------------------------------------------------------
# Carga e validação
# --------------------------------------------------------------------------
def carregar():
    conv = pd.read_csv(RAW / "conversas.csv", parse_dates=["data_abertura"])
    msg = pd.read_csv(RAW / "mensagens.csv", parse_dates=["timestamp"])
    ped = pd.read_csv(RAW / "pedidos.csv", parse_dates=["data_pedido"])
    return conv, msg, ped


def validar(conv, msg, ped) -> dict:
    return {
        "conversas": len(conv),
        "mensagens": len(msg),
        "pedidos": len(ped),
        "conversas_duplicadas": int(conv.conversation_id.duplicated().sum()),
        "mensagens_duplicadas": int(msg.message_id.duplicated().sum()),
        "conversas_sem_pedido_na_base": int((~conv.order_id.isin(ped.order_id)).sum()),
        "conversas_sem_mensagem": int((~conv.conversation_id.isin(msg.conversation_id)).sum()),
        "conversas_sem_tag": int(conv.tag_agente.isna().sum()),
    }


def contar_pii(msg) -> dict:
    cli = msg.loc[msg.autor == "cliente", "texto"].fillna("")
    return {
        "msgs_cliente": int(len(cli)),
        "com_cpf": int(cli.str.contains(RE_CPF).sum()),
        "com_telefone": int(cli.str.contains(RE_TEL).sum()),
        "com_cartao": int(cli.str.contains(RE_CARTAO).sum()),
        "com_email": int(cli.str.contains(RE_EMAIL).sum()),
    }


# --------------------------------------------------------------------------
# Construção da base por conversa
# --------------------------------------------------------------------------
def montar_base(conv, msg, ped) -> pd.DataFrame:
    cli = msg[msg.autor == "cliente"].sort_values(["conversation_id", "timestamp"])
    abertura = cli.groupby("conversation_id").texto.first()
    t_cli = cli.groupby("conversation_id").timestamp.first()
    t_ag = (msg[msg.autor == "agente"].sort_values("timestamp")
            .groupby("conversation_id").timestamp.first())

    # sinais de saúde e ameaça em QUALQUER mensagem do cliente da conversa
    cli = cli.assign(
        saude=cli.texto.str.contains(RE_SAUDE, na=False),
        ameaca=cli.texto.str.contains(RE_AMEACA, na=False),
    )
    sinais = cli.groupby("conversation_id")[["saude", "ameaca"]].any()

    df = conv.merge(
        ped[["order_id", "status_entrega", "data_pedido", "valor", "transportadora", "uf"]],
        on="order_id", how="left",
    )
    df["abertura"] = df.conversation_id.map(abertura)
    df["t_cliente"] = df.conversation_id.map(t_cli)
    df["t_agente"] = df.conversation_id.map(t_ag)
    df = df.join(sinais, on="conversation_id")
    df[["saude", "ameaca"]] = df[["saude", "ameaca"]].fillna(False).astype(bool)

    df = df.sort_values(["order_id", "data_abertura"]).reset_index(drop=True)
    df["seq"] = df.groupby("order_id").cumcount() + 1
    df["canal_seguinte"] = df.groupby("order_id").canal.shift(-1)

    df["motivos"] = df.abertura.map(classificar_abertura)
    df["motivo"] = df.motivos.str[0]
    df["multi_intencao"] = df.motivos.map(len) > 1
    df["custo"] = df.canal.map(CUSTO_CANAL) * FATOR_AMOSTRA
    df["grupo"] = df.motivo.map(GRUPO).fillna("sem_acao")
    df["nivel"] = df.apply(nivel_autonomia, axis=1)
    df["recontato_declarado"] = df.abertura.fillna("").str.contains(
        r"Já é a \d+ª vez|De novo aqui|Ninguém me respondeu", regex=True)
    return df


# --------------------------------------------------------------------------
# Análises
# --------------------------------------------------------------------------
def minutos_uteis(ini, fim, h0=HORARIO[0], h1=HORARIO[1]) -> float:
    if pd.isna(ini) or pd.isna(fim):
        return np.nan
    total, atual = 0.0, ini
    while atual < fim:
        a = atual.replace(hour=h0, minute=0, second=0)
        b = atual.replace(hour=h1, minute=0, second=0)
        lo, hi = max(atual, a), min(fim, b)
        if hi > lo:
            total += (hi - lo).total_seconds() / 60
        atual = atual.normalize() + pd.Timedelta(days=1)
    return total


def analise_motivos_custos(df) -> pd.DataFrame:
    total = df.custo.sum()
    g = df.groupby("motivo").agg(
        conversas=("custo", "size"),
        custo_rs=("custo", "sum"),
        pct_reclame_aqui=("canal", lambda s: (s == "reclame_aqui").mean() * 100),
    ).sort_values("custo_rs", ascending=False)
    g["pct_conversas"] = g.conversas / len(df) * 100
    g["pct_custo"] = g.custo_rs / total * 100
    return g.round(1)


def tag_coerente(tag, motivos) -> bool:
    """A tag é coerente se bater com qualquer um dos motivos da conversa."""
    return isinstance(tag, str) and any(tag in TAG_ESPERADA.get(m, set()) for m in motivos)


def analise_tags(df) -> tuple:
    v = df[df.motivo != "sem_mensagem_cliente"].copy()
    v["tag_coerente"] = [tag_coerente(t, ms) for t, ms in zip(v.tag_agente, v.motivos)]
    v = v[v.motivo.isin(TAG_ESPERADA)]
    tab = v.groupby("motivo").tag_coerente.agg(["mean", "size"]).rename(
        columns={"mean": "concordancia", "size": "conversas"}).round(3)
    return tab.sort_values("concordancia"), float(v.tag_coerente.mean()), len(v)


def analise_sla(df) -> pd.DataFrame:
    d = df.dropna(subset=["t_cliente", "t_agente"]).copy()
    d["espera_min"] = (d.t_agente - d.t_cliente).dt.total_seconds() / 60
    wa = d.canal == "whatsapp"
    d["espera_util_min"] = d.espera_min
    d.loc[wa, "espera_util_min"] = [
        minutos_uteis(a, b) for a, b in zip(d.loc[wa, "t_cliente"], d.loc[wa, "t_agente"])
    ]
    d["estourou"] = d.espera_util_min > d.canal.map(SLA_MIN)
    return d.groupby("canal").agg(
        conversas=("estourou", "size"),
        mediana_min=("espera_util_min", "median"),
        p90_min=("espera_util_min", lambda s: s.quantile(0.9)),
        pct_estouro_sla=("estourou", lambda s: s.mean() * 100),
    ).round(1)


def analise_recontato_escalada(df) -> dict:
    ra = df[df.canal == "reclame_aqui"]
    nao_ra = df[df.canal != "reclame_aqui"]
    base = df[(df.groupby("order_id").conversation_id.transform("size") > 1) & (df.canal != "reclame_aqui")]
    amea = base[base.ameaca]
    sem = base[~base.ameaca]
    prox_ra = lambda d: float((d.canal_seguinte == "reclame_aqui").mean()) if len(d) else np.nan
    return {
        "pct_conversas_recontato": round((df.seq > 1).mean() * 100, 1),
        "custo_recontato_rs": round(df.loc[df.seq > 1, "custo"].sum()),
        "pct_ra_recontato": round((ra.seq > 1).mean() * 100, 1),
        "pct_demais_recontato": round((nao_ra.seq > 1).mean() * 100, 1),
        "custo_ra_apos_outra_conversa_rs": round(ra.loc[ra.seq > 1, "custo"].sum()),
        "custo_ra_total_rs": round(ra.custo.sum()),
        "p_proxima_ra_com_ameaca": round(prox_ra(amea), 3),
        "n_com_ameaca": int(len(amea)),
        "p_proxima_ra_sem_ameaca": round(prox_ra(sem), 3),
        "pct_aberturas_com_recontato_declarado": round(df.recontato_declarado.mean() * 100, 1),
    }


def analise_transportadora(df) -> pd.DataFrame:
    logi = df.motivo.isin(["rastreio", "atraso"])
    ref = df[~df.motivo.isin(["rastreio", "atraso", "sem_mensagem_cliente"])].drop_duplicates("order_id")
    t = pd.DataFrame({
        "pct_nos_contatos_logisticos": df[logi].transportadora.value_counts(normalize=True) * 100,
        "pct_na_referencia": ref.transportadora.value_counts(normalize=True) * 100,
    })
    t["razao"] = t.pct_nos_contatos_logisticos / t.pct_na_referencia
    return t.round(2).sort_values("razao", ascending=False)


def analise_uf(df) -> pd.DataFrame:
    logi = df.motivo.isin(["rastreio", "atraso"])
    ref = df[~df.motivo.isin(["rastreio", "atraso", "sem_mensagem_cliente"])]
    t = pd.DataFrame({
        "pct_nos_contatos_logisticos": df[logi].uf.value_counts(normalize=True) * 100,
        "pct_na_referencia": ref.uf.value_counts(normalize=True) * 100,
    }).fillna(0)
    t["razao"] = t.pct_nos_contatos_logisticos / t.pct_na_referencia.replace(0, np.nan)
    return t.round(2).sort_values("pct_nos_contatos_logisticos", ascending=False).head(12)


def analise_autonomia(df) -> pd.DataFrame:
    v = df[df.nivel >= 0]
    g = v.groupby("nivel").agg(conversas=("nivel", "size"), custo_rs=("custo", "sum"))
    g["pct_conversas"] = g.conversas / len(v) * 100
    g["pct_custo"] = g.custo_rs / v.custo.sum() * 100
    return g.round(1)


def analise_grupos(df) -> pd.DataFrame:
    g = df.groupby("grupo").agg(conversas=("custo", "size"), custo_rs=("custo", "sum"))
    g["pct_custo"] = g.custo_rs / df.custo.sum() * 100
    return g.round(1).sort_values("custo_rs", ascending=False)


def analise_reacao_adversa(df, msg) -> dict:
    ra = df[df.motivos.map(lambda m: "reacao_adversa" in m)]
    ag = msg[(msg.conversation_id.isin(ra.conversation_id)) & (msg.autor == "agente")]
    citam = ag[ag.texto.str.contains(
        r"cosmetovig|\blote\b|respons[áa]vel t[ée]cnica|protocolo|registr", case=False, na=False)]
    return {
        "conversas": int(len(ra)),
        "com_tag_especifica": 0,  # a lista de tags não tem categoria de reação adversa
        "tags_usadas": {str(k): int(v) for k, v in ra.tag_agente.fillna("SEM_TAG").value_counts().items()},
        "agente_cita_registro_ou_lote": int(citam.conversation_id.nunique()),
        "agente_oferece_troca": int(ag[ag.texto.str.contains("troca", case=False, na=False)].conversation_id.nunique()),
    }


# --------------------------------------------------------------------------
# Execução
# --------------------------------------------------------------------------
def titulo(txt):
    print("\n" + "=" * 78 + f"\n{txt}\n" + "=" * 78)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # acentos corretos no terminal do Windows
    OUT.mkdir(parents=True, exist_ok=True)
    INTERIM.mkdir(parents=True, exist_ok=True)
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 30)

    conv, msg, ped = carregar()
    metricas = {}

    titulo("1. Validação dos dados")
    metricas["validacao"] = validar(conv, msg, ped)
    metricas["pii_nas_mensagens"] = contar_pii(msg)
    print(json.dumps(metricas["validacao"], indent=2, ensure_ascii=False))
    print("PII nas mensagens do cliente:", metricas["pii_nas_mensagens"])

    df = montar_base(conv, msg, ped)
    df.drop(columns=["abertura", "motivos"]).to_csv(
        INTERIM / "conversas_classificadas.csv", index=False)  # sem texto; fora do Git

    com_msg = df[df.motivo != "sem_mensagem_cliente"]
    metricas["resumo"] = {
        "conversas_amostra": int(len(df)),
        "conversas_com_mensagem_do_cliente": int(len(com_msg)),
        "conversas_so_bot": int((df.motivo == "sem_mensagem_cliente").sum()),
        "pct_multi_intencao": round(df.multi_intencao.mean() * 100, 1),
        "pct_nao_classificado": round((df.motivo == "nao_classificado").mean() * 100, 2),
        "custo_estimado_populacao_rs": round(df.custo.sum()),
        "conversas_estimadas_populacao": int(len(df) * FATOR_AMOSTRA),
    }

    titulo("2. Motivos reais e custo (população estimada = amostra x 3)")
    motivos = analise_motivos_custos(df)
    print(motivos)
    motivos.to_csv(OUT / "motivos_custos.csv")
    canais = df.groupby("canal").agg(conversas=("custo", "size"), custo_rs=("custo", "sum"))
    canais["pct_conversas"] = canais.conversas / len(df) * 100
    canais["pct_custo"] = canais.custo_rs / df.custo.sum() * 100
    print("\nPor canal:\n", canais.round(1))
    canais.round(1).to_csv(OUT / "canais_custos.csv")

    titulo("3. Qualidade da tag manual (tag do agente x motivo inferido)")
    tags, conc, n = analise_tags(df)
    print(tags)
    print(f"\nConcordância geral: {conc:.1%} em {n} conversas  |  divergência (teto): {1 - conc:.1%}")
    tags.to_csv(OUT / "concordancia_tags.csv")
    metricas["concordancia_tag_geral"] = round(conc, 3)
    res = df[df.motivo != "sem_mensagem_cliente"].copy()
    res["resolvido"] = res.status == "resolvido"
    res["tag_ok"] = [tag_coerente(t, ms) for t, ms in zip(res.tag_agente, res.motivos)]
    print("\nTaxa de resolução com tag coerente x divergente:",
          res[res.motivo.isin(TAG_ESPERADA)].groupby("tag_ok").resolvido.mean().round(3).to_dict())

    titulo("4. SLA de primeira resposta (WhatsApp só em horário comercial)")
    sla = analise_sla(df)
    print(sla)
    sla.to_csv(OUT / "sla.csv")
    fora = ((df.data_abertura.dt.hour < HORARIO[0]) | (df.data_abertura.dt.hour >= HORARIO[1]))
    metricas["pct_abertas_fora_do_horario"] = round(fora.mean() * 100, 1)
    print(f"\nAbertas fora de {HORARIO[0]}h-{HORARIO[1]}h: {metricas['pct_abertas_fora_do_horario']}%")

    titulo("5. Recontato e escalada para o Reclame Aqui")
    metricas["recontato_escalada"] = analise_recontato_escalada(df)
    print(json.dumps(metricas["recontato_escalada"], indent=2, ensure_ascii=False))

    titulo("6. Logística: transportadora e UF (rastreio + atraso x referência)")
    transp = analise_transportadora(df)
    print(transp)
    transp.to_csv(OUT / "transportadoras.csv")
    uf = analise_uf(df)
    print("\n", uf)
    uf.to_csv(OUT / "uf_logistica.csv")
    atrasos = df[df.motivo == "atraso"]
    metricas["pct_atraso_com_status_em_transito"] = round((atrasos.status_entrega == "em_transito").mean() * 100, 1)
    print(f"\nReclamações de atraso com status ainda 'em_transito': {metricas['pct_atraso_com_status_em_transito']}%")

    titulo("7. Reação adversa")
    metricas["reacao_adversa"] = analise_reacao_adversa(df, msg)
    print(json.dumps(metricas["reacao_adversa"], indent=2, ensure_ascii=False))

    titulo("8. Níveis de autonomia (regra preliminar, FAQ de produto/promoção pendente)")
    aut = analise_autonomia(df)
    print(aut)
    aut.to_csv(OUT / "autonomia.csv")
    print("\nPor motivo x nível:\n", pd.crosstab(com_msg.motivo, com_msg.nivel))
    pd.crosstab(com_msg.motivo, com_msg.nivel).to_csv(OUT / "autonomia_por_motivo.csv")

    titulo("9. Contatos evitáveis (hipótese de trabalho por grupo)")
    grupos = analise_grupos(df)
    print(grupos)
    grupos.to_csv(OUT / "grupos_evitaveis.csv")

    with open(OUT / "metricas.json", "w", encoding="utf-8") as f:
        json.dump(metricas, f, indent=2, ensure_ascii=False)
    print(f"\nArquivos gravados em {OUT} (agregados) e {INTERIM} (por conversa, fora do Git).")


if __name__ == "__main__":
    main()

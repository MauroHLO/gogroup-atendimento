// Sinais de saúde e de ameaça por palavra-chave (docs/decisoes.md, seção 14).
// Portados de RE_SAUDE e RE_AMEACA em analysis/analise_atendimento.py, aplicados sobre texto
// normalizado (minúsculas, sem acento). No pipeline, o sinal final é "ou" com a saída do modelo.
//
// Divergências em relação ao Python (todas registradas na seção 14):
// - o texto é normalizado, então "gravida", "bebe" e "justica" também casam;
// - "queima" virou queimadura|queimou|queimei|queimando (não pega "queima de estoque");
// - "grávida", "bebê" e "fórmula" exigem palavra inteira (não pegam "gravidade", "bebeu" nem "formulário");
// - espaços entre palavras aceitam qualquer quantidade (\s+).

export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export const RE_SAUDE =
  /gravidez|\bgravidas?\b|gestante|amament|\bbebes?\b|minha\s+filha|meu\s+filho|alerg|inchad|coceira|queimadura|queimou|queimei|queimando|bolinhas|\bformulas?\b/;

export const RE_AMEACA = /procon|advogad|processo\s+judicial|justica|abrir\s+reclamacao|reclame\s+aqui/;

export interface Sinais {
  saude: boolean;
  ameaca: boolean;
}

export function detectarSinais(texto: string): Sinais {
  const t = normalizar(texto);
  return { saude: RE_SAUDE.test(t), ameaca: RE_AMEACA.test(t) };
}

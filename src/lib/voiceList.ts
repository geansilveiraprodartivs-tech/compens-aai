// Interpretação de comandos de voz (pt-BR) para a lista de compras.
// Módulo puro (sem imports) para poder ser testado isoladamente.
//
// Exemplos reconhecidos:
//   "Arroz"                                  -> Arroz, 1 un
//   "Arroz, feijão, leite, pão e café"        -> 5 produtos, 1 un cada
//   "dois quilos de batata, três caixas de leite e uma dúzia de ovos"
//                                            -> Batata 2 kg, Leite 3 un, Ovos 12 un
//   "500 gramas de queijo e 1 litro de leite" -> Queijo 500 g, Leite 1 L

export type VoiceDraft = {
  name: string;
  quantity: number;
  unit: string;
};

/** Chave de comparação: sem acentos, minúscula, só letras/números. */
export function productKey(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Números falados (chaves já sem acento). */
const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  meio: 0.5,
  meia: 0.5,
};

/** Unidades de medida aceitas pelo aplicativo (UNITS em compensai.ts). */
const UNIT_WORDS: Record<string, string> = {
  kg: "kg",
  quilo: "kg",
  quilos: "kg",
  quilograma: "kg",
  quilogramas: "kg",
  g: "g",
  grama: "g",
  gramas: "g",
  l: "L",
  lt: "L",
  litro: "L",
  litros: "L",
  ml: "ml",
  mililitro: "ml",
  mililitros: "ml",
  un: "un",
  unidade: "un",
  unidades: "un",
};

/** Embalagens contadas em unidades. */
const CONTAINER_WORDS = new Set([
  "caixa",
  "caixas",
  "pacote",
  "pacotes",
  "garrafa",
  "garrafas",
  "lata",
  "latas",
  "saco",
  "sacos",
  "pote",
  "potes",
  "vidro",
  "vidros",
  "maco",
  "macos",
  "bandeja",
  "bandejas",
  "cartela",
  "cartelas",
  "fardo",
  "fardos",
  "peca",
  "pecas",
  "tablete",
  "tabletes",
  "barra",
  "barras",
  "sache",
  "saches",
  "garrafinha",
  "garrafinhas",
]);

const FILLER_WORDS = new Set(["de", "do", "da", "dos", "das", "o", "a", "os", "as", "um", "uma"]);

function readNumber(token: string): number | null {
  if (!token) return null;
  const value = fold(token);
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const word = NUMBER_WORDS[value];
  return word ?? null;
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseSegment(raw: string): VoiceDraft | null {
  const text = raw
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  let index = 0;
  let quantity = readNumber(tokens[0] ?? "");
  if (quantity != null) index = 1;

  let unit = "un";
  const next = tokens[index];
  if (next) {
    const key = fold(next);
    if (key === "duzia" || key === "duzias") {
      quantity = (quantity ?? 1) * 12;
      index += 1;
    } else {
      const unitWord = UNIT_WORDS[key];
      if (unitWord) {
        unit = unitWord;
        index += 1;
      } else if (CONTAINER_WORDS.has(key)) {
        unit = "un";
        index += 1;
      }
    }
  }

  if (quantity == null) quantity = 1;

  while (index < tokens.length && FILLER_WORDS.has(fold(tokens[index] ?? ""))) {
    index += 1;
  }

  const name = tokens
    .slice(index)
    .join(" ")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const key = productKey(name);
  if (key.length < 2 || /^\d+$/.test(key)) return null;

  return { name: capitalize(name), quantity, unit };
}

/** Converte uma transcrição em itens da lista, sem duplicar nomes repetidos. */
export function parseVoiceProducts(transcript: string): VoiceDraft[] {
  if (!transcript) return [];

  const segments = transcript
    .replace(/\s+/g, " ")
    .trim()
    // vírgula decimal ("1,5") não deve separar produtos
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/\s*[,;]\s*|\s+(?:e|&)\s+/i);

  const drafts: VoiceDraft[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const draft = parseSegment(segment);
    if (!draft) continue;
    const key = productKey(draft.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
    if (drafts.length >= 40) break;
  }

  return drafts;
}

// Interpretação de comandos de voz (pt-BR) para a lista de compras.
// Módulo puro (sem imports) para poder ser testado isoladamente.
//
// Reconhece nome, quantidade, unidade e PREÇO no mesmo comando:
//   "500g de presunto por 13,49"                   -> Presunto, 500 g, total R$ 13,49
//   "um quilo de arroz por 7 reais e 99 centavos"  -> Arroz, 1 kg, total R$ 7,99
//   "dois litros de leite por 8,50"                -> Leite, 2 L, total R$ 8,50
//   "uma dúzia de ovos por 12 reais"               -> Ovos, 12 un, total R$ 12,00
//   "pão por 9,99 e café por 18,90"                -> Pão R$ 9,99, Café R$ 18,90
//   "três caixas de leite a 2,99 cada"             -> Leite, 3 un, total R$ 8,97
//   "dois quilos de batata"                        -> Batata 2 kg, sem preço
//
// IMPORTANTE (semântica): o preço devolvido em `VoiceDraft.price` é o TOTAL do
// item — exatamente o valor que a pessoa falou ter pago. No banco, a coluna
// `shopping_list_items.price` guarda o preço POR UNIDADE, porque o total da
// lista é calculado como `quantity × price`. Quem consome este módulo divide o
// total pela quantidade antes de salvar (ver VoiceAdd).

export type VoiceDraft = {
  name: string;
  quantity: number;
  unit: string;
  /** Total do item em reais, como foi falado ("por 13,49"). null = sem preço. */
  price: number | null;
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
  zero: 0,
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
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
  mil: 1000,
  meio: 0.5,
  meia: 0.5,
};

/** Palavras de moeda ("por 13 reais"). */
const CURRENCY_WORDS = new Set(["reais", "real", "conto", "contos", "pila", "pilas"]);

/** Marcadores que introduzem o preço ("por 13,49", "a 2,99 cada"). */
const PRICE_MARKERS = new Set([
  "por",
  "a",
  "custa",
  "custam",
  "custando",
  "sai",
  "saindo",
  "ta",
  "esta",
]);

/** Enfeites entre o marcador e o valor ("por apenas 9,99", "cerca de 10 reais"). */
const PRICE_FILLERS = new Set(["apenas", "somente", "so", "cerca", "de", "uns", "umas"]);

/** Unidades de medida aceitas pelo aplicativo (UNITS em compensai.ts). */
const UNIT_WORDS: Record<string, string> = {
  kg: "kg",
  quilo: "kg",
  quilos: "kg",
  kilo: "kg",
  kilos: "kg",
  quilograma: "kg",
  quilogramas: "kg",
  g: "g",
  gr: "g",
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

/** Palavras de ligação que sobram no começo de um item ("e também café"). */
const LEADING_NOISE = new Set([
  "e",
  "tambem",
  "mais",
  "depois",
  "entao",
  "agora",
  "ai",
  "so",
  "apenas",
]);

/** Pontuação que separa produtos. */
const BOUNDARY_PUNCT = new Set([",", ";", ".", "!", "?", "@"]);

/**
 * Cabeças de produto conhecidas (sem acento, minúsculas).
 *
 * Por que existe: o reconhecedor de voz — em especial o nativo do APK — devolve
 * a fala SEM vírgulas e sem marcar pausas ("batata carne arroz e feijão").
 * Sem esta lista, tudo antes do "e" viraria um único produto gigante.
 *
 * Só entram substantivos que são produtos de verdade. Adjetivos que costumam
 * acompanhar outro produto ("integral", "moída", "preto", "doce", "pó") ficam
 * de fora de propósito, para não quebrar nomes compostos.
 */
const PRODUCT_HEADS = new Set<string>([
  // frutas
  "banana",
  "bananas",
  "maca",
  "macas",
  "laranja",
  "laranjas",
  "mamao",
  "melancia",
  "melao",
  "uva",
  "uvas",
  "abacaxi",
  "manga",
  "pera",
  "limao",
  "tangerina",
  "mexerica",
  "morango",
  "morangos",
  "abacate",
  "goiaba",
  "kiwi",
  "pessego",
  "ameixa",
  "ameixas",
  "cereja",
  "acerola",
  "maracuja",
  "caqui",
  "figo",
  "coco",
  // verduras e legumes
  "cebola",
  "cebolas",
  "alho",
  "tomate",
  "tomates",
  "batata",
  "batatas",
  "cenoura",
  "cenouras",
  "abobrinha",
  "abobora",
  "chuchu",
  "brocolis",
  "couve",
  "alface",
  "rucula",
  "agriao",
  "espinafre",
  "repolho",
  "pepino",
  "pimentao",
  "beterraba",
  "mandioca",
  "aipim",
  "inhame",
  "quiabo",
  "berinjela",
  "milho",
  "ervilha",
  "vagem",
  "salsinha",
  "cebolinha",
  "coentro",
  "gengibre",
  "cogumelo",
  "champignon",
  // carnes, peixes e frios
  "carne",
  "carnes",
  "frango",
  "peixe",
  "peixes",
  "porco",
  "costela",
  "alcatra",
  "picanha",
  "coxa",
  "sobrecoxa",
  "file",
  "bife",
  "linguica",
  "salsicha",
  "bacon",
  "presunto",
  "mortadela",
  "salame",
  "hamburguer",
  "ovo",
  "ovos",
  "tilapia",
  "sardinha",
  "atum",
  "camarao",
  "patinho",
  // laticínios
  "leite",
  "queijo",
  "queijos",
  "iogurte",
  "manteiga",
  "margarina",
  "requeijao",
  "creme",
  "nata",
  "ricota",
  "mussarela",
  "mucarela",
  "parmesao",
  "catupiry",
  "provolone",
  "coalhada",
  // grãos, massas e padaria
  "arroz",
  "feijao",
  "macarrao",
  "espaguete",
  "farinha",
  "aveia",
  "granola",
  "cereal",
  "pao",
  "paes",
  "biscoito",
  "bolacha",
  "bolo",
  "torrada",
  "tapioca",
  "cuscuz",
  "fuba",
  "lentilha",
  "quinoa",
  "trigo",
  "polvilho",
  "fermento",
  // despensa
  "acucar",
  "sal",
  "oleo",
  "azeite",
  "vinagre",
  "cafe",
  "cha",
  "achocolatado",
  "molho",
  "extrato",
  "ketchup",
  "maionese",
  "mostarda",
  "mel",
  "geleia",
  "chocolate",
  "bala",
  "sorvete",
  "suco",
  "refrigerante",
  "agua",
  "cerveja",
  "vinho",
  "tempero",
  "caldo",
  // limpeza, higiene e casa
  "sabao",
  "detergente",
  "amaciante",
  "desinfetante",
  "alvejante",
  "papel",
  "absorvente",
  "fralda",
  "shampoo",
  "condicionador",
  "sabonete",
  "desodorante",
  "pasta",
  "escova",
  "esponja",
  "vassoura",
  "rodo",
  "saco",
  "pilha",
  "lampada",
  "vela",
  "fosforo",
  "carvao",
  "racao",
  "areia",
  "guardanapo",
  "copo",
]);

/**
 * Palavras que "colam" no produto anterior, indicando nome composto:
 * "filé de frango", "suco de laranja", "café com leite", "pão de queijo".
 * Nesses casos a cabeça seguinte NÃO abre um produto novo.
 */
const HEAD_GLUE = new Set(["de", "do", "da", "dos", "das", "com", "sem"]);

/**
 * Compostos em que a segunda palavra também é cabeça de produto, mas é uma
 * VARIEDADE da primeira ("banana maçã", "tomate cereja"). Sem esta exceção o
 * nome seria quebrado em dois produtos.
 */
const COMPOUND_TAILS = new Set(["banana maca", "tomate cereja"]);

/** Quantas palavras olhar à frente para decidir se uma quantidade abre item. */
const QUANTITY_LOOKAHEAD = 4;

/** Valor em reais de um preço já interpretado. */
type Amount = { value: number; next: number };

/** Um trecho da fala que é um preço: "por 13,49" ocupa os tokens [start, end). */
type PriceSpan = {
  start: number;
  end: number;
  value: number;
  /** "a 2,99 cada" -> o valor é por unidade, não o total do item. */
  perUnit: boolean;
};

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

/* --------------------------------------------------------------- tokenização */

/**
 * Quebra a fala em tokens preservando vírgula decimal:
 *   "500g de presunto por 13,49" -> ["500", "g", "de", "presunto", "por", "13.49"]
 * Milhar com ponto ("1.299,90") é normalizado para "1299.90".
 */
function tokenize(transcript: string): string[] {
  let text = transcript.replace(/\s+/g, " ").trim();
  // ponto de milhar: 1.299,90 -> 1299,90 (até 3 grupos, o suficiente para preços)
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(/(\d)\.(\d{3})(?=\D|$)/g, "$1$2");
    if (next === text) break;
    text = next;
  }
  // vírgula decimal: 13,49 -> 13.49
  text = text.replace(/(\d),(\d)/g, "$1.$2").replace(/r\$/gi, " r$ ");

  const matches = text.match(/\d+(?:\.\d+)?|[^\s.,;:!?@]+|[.,;:!?@]/g);
  return matches ?? [];
}

/* ------------------------------------------------------------ números falados */

/**
 * O "e" só continua o MESMO número quando é uma composição válida em pt-BR:
 *   "quarenta e nove" (dezena + unidade), "cento e vinte", "mil e duzentos".
 * Serve também para não engolir o preço: em "treze e quarenta e nove" o "e"
 * separa reais de centavos (13,49), não 62.
 */
function joinableWithE(last: number, partial: number, next: number | null): boolean {
  if (next == null) return false;
  if (last >= 20 && last % 10 === 0 && next < 10) return true;
  if (partial > 0 && partial % 100 === 0 && next < 100) return true;
  return false;
}

/** Números falados compostos: "quarenta e nove", "mil duzentos e noventa e nove". */
function parseSpokenNumber(tokens: string[], start: number): Amount | null {
  let index = start;
  let total = 0;
  let group = 0;
  let count = 0;
  let last = 0;

  while (index < tokens.length) {
    const word = fold(tokens[index] ?? "");
    if (word === "e") {
      const after = fold(tokens[index + 1] ?? "");
      const nextWord = NUMBER_WORDS[after];
      const digit = /^\d+$/.test(after);
      const next = digit ? Number(after) : (nextWord ?? null);
      if ((digit || nextWord != null) && joinableWithE(last, total + group, next)) {
        index += 1;
        continue;
      }
      break;
    }
    // "meio/meia" é quantidade (meio quilo), não componente de preço
    if (word === "meio" || word === "meia") break;
    const value = NUMBER_WORDS[word];
    if (value == null) break;
    if (word === "mil") {
      group = (group || 1) * 1000;
      total += group;
      group = 0;
      last = 0;
    } else {
      group += value;
      last = value;
    }
    count += 1;
    index += 1;
  }

  if (count === 0) return null;
  return { value: total + group, next: index };
}

/** Número escrito em dígitos ("13.49") ou falado ("treze"). */
function parseAmount(tokens: string[], start: number): Amount | null {
  const token = tokens[start];
  if (token == null) return null;
  if (/^\d+(?:\.\d+)?$/.test(token)) {
    const value = Number(token);
    return Number.isFinite(value) ? { value, next: start + 1 } : null;
  }
  return parseSpokenNumber(tokens, start);
}

/** Fim de um valor de preço: pontuação, separador de itens ou "cada". */
function isPriceStop(token?: string): boolean {
  if (token == null) return true;
  const word = fold(token);
  return BOUNDARY_PUNCT.has(word) || word === "e" || word === "cada";
}

/** Centavos falados depois de "e": "e 49 centavos", "e quarenta e nove". */
function parseCents(tokens: string[], start: number): Amount | null {
  const amount = parseAmount(tokens, start);
  if (!amount) return null;
  if (!Number.isInteger(amount.value) || amount.value <= 0 || amount.value >= 100) return null;

  let next = amount.next;
  const word = fold(tokens[next] ?? "");
  if (word === "centavos" || word === "centavo") next += 1;
  else if (!isPriceStop(tokens[next])) return null;

  return { value: amount.value, next };
}

/** Valor de um preço: "13,49", "treze e quarenta e nove", "7 reais e 99 centavos". */
function parsePriceValue(tokens: string[], start: number): Amount | null {
  let index = start;
  if (fold(tokens[index] ?? "") === "r$") index += 1;

  const amount = parseAmount(tokens, index);
  if (!amount) return null;

  let value = amount.value;
  let next = amount.next;
  const integer = Number.isInteger(value);

  if (CURRENCY_WORDS.has(fold(tokens[next] ?? ""))) next += 1;

  // "treze e quarenta e nove" = 13,49 (só quando o inteiro ainda não tem centavos)
  if (integer && fold(tokens[next] ?? "") === "e") {
    const cents = parseCents(tokens, next + 1);
    if (cents) {
      value += cents.value / 100;
      next = cents.next;
    }
  }

  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, next };
}

/** "cada", "cada um", "a unidade", "por unidade" -> preço unitário. */
function readPerUnit(tokens: string[], start: number): number {
  const first = fold(tokens[start] ?? "");
  const second = fold(tokens[start + 1] ?? "");
  if (first === "cada") return second === "um" ? start + 2 : start + 1;
  if (first === "a" || first === "por" || first === "o") {
    if (second === "unidade" || second === "unidades" || second === "cada") return start + 2;
  }
  return -1;
}

/** Encontra todos os preços da fala (na ordem em que aparecem). */
function findPriceSpans(tokens: string[]): PriceSpan[] {
  const spans: PriceSpan[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const word = fold(tokens[index] ?? "");
    const marker = PRICE_MARKERS.has(word);
    const symbol = word === "r$";
    // "pão 9 reais" (sem "por"): número seguido da palavra de moeda
    const implicit =
      !marker &&
      !symbol &&
      CURRENCY_WORDS.has(fold(tokens[index + 1] ?? "")) &&
      parseAmount(tokens, index) != null;

    if (!marker && !symbol && !implicit) continue;

    // "por 13,49" (marcador) e "R$ 13,49" pulam o marcador; preço implícito
    // ("pão 9 reais") começa no próprio número.
    let valueStart = marker ? index + 1 : index;
    while (valueStart < tokens.length && PRICE_FILLERS.has(fold(tokens[valueStart] ?? ""))) {
      valueStart += 1;
    }

    const parsed = parsePriceValue(tokens, valueStart);
    if (!parsed) continue;

    const perUnitEnd = readPerUnit(tokens, parsed.next);
    const end = perUnitEnd > 0 ? perUnitEnd : parsed.next;

    spans.push({ start: index, end, value: parsed.value, perUnit: perUnitEnd > 0 });
    index = end - 1;
  }

  return spans;
}

/* ---------------------------------------------------------------- produtos */

/** Um token é uma unidade contada como quantidade ("quilos", "caixas", "dúzia")? */
function isQuantityUnit(word: string): boolean {
  return (
    UNIT_WORDS[word] != null || CONTAINER_WORDS.has(word) || word === "duzia" || word === "duzias"
  );
}

/**
 * O token em `index` começa um produto novo mesmo SEM vírgula e SEM "e"?
 *
 * É o que resolve o caso do reconhecedor nativo do APK, que devolve
 * "batata carne arroz e feijão" (sem pausas):
 *  1. substantivo de produto conhecido, desde que a palavra anterior não seja
 *     de ligação — "pão de queijo", "suco de laranja" e "café com leite"
 *     continuam sendo UM produto;
 *  2. quantidade seguida de unidade e de ligação/produto — "... batata um quilo
 *     de arroz" → "um quilo de arroz" abre um novo item.
 */
function opensNewProduct(tokens: string[], index: number, covered: boolean[]): boolean {
  if (index === 0 || covered[index]) return false;

  const word = fold(tokens[index] ?? "");
  const previous = fold(tokens[index - 1] ?? "");
  if (HEAD_GLUE.has(previous)) return false;

  if (PRODUCT_HEADS.has(word)) return !COMPOUND_TAILS.has(`${previous} ${word}`);

  if (readNumber(word) == null) return false;

  const limit = Math.min(index + QUANTITY_LOOKAHEAD, tokens.length - 1);
  for (let look = index + 1; look <= limit; look += 1) {
    const next = fold(tokens[look] ?? "");
    if (!isQuantityUnit(next)) continue;
    const after = fold(tokens[look + 1] ?? "");
    // sem palavra depois ("... e três caixas") a quantidade já abre o item
    return after === "" || HEAD_GLUE.has(after) || PRODUCT_HEADS.has(after);
  }
  return false;
}

/**
 * Divide a fala em trechos de produto: pontuação, "e", "&" e a heurística de
 * `opensNewProduct` (fala sem pausas). Preços já reconhecidos são preservados
 * dentro do trecho para o cálculo posterior.
 */
function splitSegments(tokens: string[], covered: boolean[]): Array<[number, number]> {
  const segments: Array<[number, number]> = [];
  let start = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    if (covered[index]) continue;
    const word = fold(tokens[index] ?? "");

    // pontuação e "e" são separadores consumidos (não entram no nome)
    if (BOUNDARY_PUNCT.has(word) || word === "e" || word === "&") {
      if (index > start) segments.push([start, index]);
      start = index + 1;
      continue;
    }

    // cabeça de produto / nova quantidade: o token abre o trecho seguinte
    if (index > start && opensNewProduct(tokens, index, covered)) {
      segments.push([start, index]);
      start = index;
    }
  }

  if (start < tokens.length) segments.push([start, tokens.length]);

  return segments;
}

/** Nome + quantidade + unidade de um trecho (sem a parte do preço). */
function parseProduct(tokens: string[]): { name: string; quantity: number; unit: string } | null {
  let index = 0;
  while (index < tokens.length && LEADING_NOISE.has(fold(tokens[index] ?? ""))) index += 1;
  if (index >= tokens.length) return null;

  let quantity = readNumber(tokens[index] ?? "");
  if (quantity != null) index += 1;

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

  while (index < tokens.length) {
    const key = fold(tokens[index] ?? "");
    if (!FILLER_WORDS.has(key) && !LEADING_NOISE.has(key)) break;
    index += 1;
  }

  const name = tokens
    .slice(index)
    .join(" ")
    .replace(/^[.,;:!?@$]+|[.,;:!?@]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const key = productKey(name);
  if (key.length < 2 || /^\d+$/.test(key)) return null;

  return { name: capitalize(name), quantity, unit };
}

/** Converte uma transcrição em itens da lista, sem duplicar nomes repetidos. */
export function parseVoiceProducts(transcript: string): VoiceDraft[] {
  if (!transcript) return [];

  const tokens = tokenize(transcript);
  if (tokens.length === 0) return [];

  const spans = findPriceSpans(tokens);
  const covered = new Array<boolean>(tokens.length).fill(false);
  for (const span of spans) {
    for (let index = span.start; index < span.end; index += 1) covered[index] = true;
  }

  const drafts: VoiceDraft[] = [];
  const seen = new Map<string, number>();

  /**
   * Registra um item. Nome já reconhecido nesta mesma fala NÃO cria outra linha
   * (evita repetição); só completa o que faltava (preço, quantidade, unidade).
   */
  function push(
    item: { name: string; quantity: number; unit: string } | null,
    price: number | null,
  ) {
    if (!item) return;
    const key = productKey(item.name);
    if (!key) return;

    const at = seen.get(key);
    if (at == null) {
      seen.set(key, drafts.length);
      drafts.push({ ...item, price });
      return;
    }

    const kept = drafts[at];
    if (!kept) return;
    if (kept.price == null && price != null) kept.price = price;
    if (kept.quantity === 1 && kept.unit === "un" && (item.quantity !== 1 || item.unit !== "un")) {
      kept.quantity = item.quantity;
      kept.unit = item.unit;
    }
  }

  for (const [segStart, segEnd] of splitSegments(tokens, covered)) {
    const segSpans = spans.filter((span) => span.start >= segStart && span.end <= segEnd);

    // Um preço só vale para o item que vem ANTES dele ("dois reais de pão" não é
    // preço de nada: o trecho anterior não tem nome de produto).
    const accepted: PriceSpan[] = [];
    let cursor = segStart;
    for (const span of segSpans) {
      const before = tokens.slice(cursor, span.start);
      if (!before.some((token) => /[a-z]/i.test(token))) continue;
      accepted.push(span);
      cursor = span.end;
    }

    if (accepted.length === 0) {
      // Sem preço válido para este item: nome/quantidade ficam só no texto antes
      // do primeiro preço ("por 13,49" sozinho não vira produto).
      const first = segSpans[0];
      const limit = first ? first.start : segEnd;
      push(parseProduct(tokens.slice(segStart, limit)), null);
      continue;
    }

    cursor = segStart;
    for (const span of accepted) {
      const product = parseProduct(tokens.slice(cursor, span.start));
      if (product) {
        const total = span.perUnit ? span.value * product.quantity : span.value;
        push(product, Number.isFinite(total) && total > 0 ? roundMoney(total) : null);
      }
      cursor = span.end;
    }
  }

  return drafts.slice(0, 40);
}

/** Arredonda para centavos (evita 8.499999999 no total). */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------- transcrição acumulada */

/**
 * Acumula um trecho FINAL do reconhecimento de voz sem repetir conteúdo.
 *
 * O mesmo trecho pode chegar mais de uma vez: o reconhecedor nativo reenvia em
 * `onResults` o que já tinha mandado, o Web Speech repete o resultado final e
 * alguns serviços reenviam a transcrição inteira (cumulativa). Aqui:
 *   - trecho já contido na fala acumulada é ignorado;
 *   - reenvio cumulativo ("batata" -> "batata carne") substitui o histórico;
 *   - conteúdo novo é anexado e continua valendo para a próxima fala.
 */
export function appendTranscriptChunks(chunks: string[], text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const key = productKey(clean);
  if (!key) return chunks;

  const wholeKey = productKey(chunks.join(" "));
  if (wholeKey && ` ${wholeKey} `.includes(` ${key} `)) return chunks;
  if (wholeKey && key.startsWith(`${wholeKey} `)) return [clean];

  return [...chunks, clean];
}

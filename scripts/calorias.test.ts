// Testes da seção "Calorias" (helpers puros + prioridade das fontes).
//   node scripts/calorias.test.ts
//
// Não usa rede, IA, Supabase nem conta de usuário: só funções puras de
// src/lib/nutrition.ts.

import {
  CONFIDENCE_LABELS,
  EMPTY_NUTRIENTS,
  HISTORY_LIMIT,
  ORIGIN_LABELS,
  addHistory,
  buildPortion,
  clearHistory,
  composeAnalysis,
  deriveBenefits,
  deriveCautions,
  evaluateFit,
  fmtGrams,
  fmtKcal,
  fmtNumber,
  fmtPortion,
  fmtSodium,
  goalLabel,
  hasNutrition,
  historyKey,
  historySummary,
  nameMatchScore,
  nutrientsFromOpenFoodFacts,
  pageToText,
  readGoal,
  readHistory,
  removeHistory,
  sanitizeNutrients,
  scaleNutrients,
  sourceMentionsProduct,
  textConfirmsEnergy,
  toNumber,
  writeGoal,
  type AiFoodPayload,
  type FoodAnalysis,
  type HistoryEntry,
  type OffMatch,
  type WebMatch,
} from "../src/lib/nutrition.ts";

let failures = 0;
let passed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else {
    failures += 1;
    console.log(
      `FAIL  ${name}  -> recebido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)}`,
    );
  }
}

function ok(name: string, condition: boolean) {
  if (condition) passed += 1;
  else {
    failures += 1;
    console.log(`FAIL  ${name}`);
  }
}

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/* ------------------------------------------------------------ valores/números */

check("toNumber: rótulo pt-BR", toNumber("13,5"), 13.5);
check("toNumber: milhar", toNumber("1.234,5"), 1234.5);
check("toNumber: unidade", toNumber("9 g"), 9);
check("toNumber: lixo", toNumber("n/d"), null);

check(
  "sanitize: valores válidos",
  sanitizeNutrients({ kcal: 152, carbs: 30, protein: 8, sodium: 320 }),
  {
    kcal: 152,
    carbs: 30,
    protein: 8,
    fat: null,
    sat_fat: null,
    trans_fat: null,
    fiber: null,
    sugar: null,
    sodium: 320,
  },
);

check(
  "sanitize: absurdos viram null",
  sanitizeNutrients({ kcal: 5000, carbs: 480, protein: -2, sodium: 99999 }),
  {
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    sat_fat: null,
    trans_fat: null,
    fiber: null,
    sugar: null,
    sodium: null,
  },
);

/* ------------------------------------------------------------------- porções */

const per100 = sanitizeNutrients({
  kcal: 200,
  carbs: 40,
  protein: 10,
  fat: 5,
  fiber: 2,
  sugar: 12,
  sodium: 400,
});

const porcao30 = buildPortion(per100, 30, "1 fatia", "100 g");
check("porção: kcal", porcao30.nutrients.kcal, 60);
check("porção: carboidratos", porcao30.nutrients.carbs, 12);
check("porção: sódio em mg", porcao30.nutrients.sodium, 120);
check("porção: rótulo formatado", fmtPortion(porcao30, "100 g"), "1 fatia (30 g)");

const porcaoSemPeso = buildPortion(per100, null, null, "100 g");
check("porção sem peso: assume 100 g", porcaoSemPeso.grams, 100);
check("porção sem peso: kcal", porcaoSemPeso.nutrients.kcal, 200);

const porcaoBebida = buildPortion(per100, 200, null, "100 ml");
check("porção bebida: rótulo padrão", porcaoBebida.label, "200 ml");

check("escala: 150 g de 200 kcal", scaleNutrients(per100, 150).kcal, 300);
check("escala: sódio proporcional", scaleNutrients(per100, 150).sodium, 600);
check("escala: sem quantidade", scaleNutrients(per100, null), EMPTY_NUTRIENTS);

/* ------------------------------------------------------------ Open Food Facts */

check(
  "OFF: campos padrão",
  nutrientsFromOpenFoodFacts({
    "energy-kcal_100g": 250,
    carbohydrates_100g: 33.3,
    proteins_100g: 7,
    "saturated-fat_100g": 3,
    "trans-fat_100g": 0,
    sugars_100g: 4,
    sodium_100g: 0.45,
  }),
  {
    kcal: 250,
    carbs: 33.3,
    protein: 7,
    fat: null,
    sat_fat: 3,
    trans_fat: 0,
    fiber: null,
    sugar: 4,
    sodium: 450,
  },
);

check("OFF: kJ convertido em kcal", nutrientsFromOpenFoodFacts({ energy_100g: 418.4 }).kcal, 100);
check("OFF: sal 2,5 g → 1 g de sódio", nutrientsFromOpenFoodFacts({ salt_100g: 2.5 }).sodium, 1000);
check("OFF: sem dados", nutrientsFromOpenFoodFacts({}), EMPTY_NUTRIENTS);

/* ------------------------------------------------------------ nome e formato */

ok("nome igual", nameMatchScore("Leite integral", "Leite integral") >= 0.99);
ok(
  "nome parcial",
  nameMatchScore("Iogurte natural integral Nestlé", "Iogurte natural integral") >= 0.6,
);
ok("nome diferente", nameMatchScore("Banana prata", "Detergente Ypê") < 0.2);
ok("nome sem tokens", nameMatchScore("de", "a") === 0);

check("fmtKcal null", fmtKcal(null), "—");
check("fmtGrams 1 casa", fmtGrams(2.25), "2,3 g");
check("fmtSodium mg", fmtSodium(320), "320 mg");
check("fmtSodium g", fmtSodium(1500), "1,50 g");
check("fmtSodium null", fmtSodium(null), "—");
check("fmtNumber 0 casas", fmtNumber(1234.6, 0), "1.235");

/* --------------------------------------------------- verificação de fonte web */

const htmlFonte = `
<html><head><style>.x{color:red}</style>
<script>var kcal = 999;</script></head>
<body><h1>Nescau 2.0 em pó</h1>
<p>Informação nutricional por 100 g: valor energético 380 kcal; carboidratos 84 g.</p>
</body></html>`;

const texto = pageToText(htmlFonte);
ok("pageToText: remove script", !texto.includes("999"));
ok("pageToText: remove tags", !texto.includes("<p>"));
ok("pageToText: texto visível", texto.includes("nescau 2.0 em pó"));
ok("pageToText: minúsculas", texto === texto.toLowerCase());

ok("energia: número com kcal confirma", textConfirmsEnergy(texto, 380));
ok("energia: número ausente não confirma", !textConfirmsEnergy(texto, 250));
ok("energia: 0 exige zero explícito", !textConfirmsEnergy(texto, 0));
ok("energia: zero explícito aceito", textConfirmsEnergy("bebida zero: 0 kcal", 0));
ok("energia: kcal null só exige menção", textConfirmsEnergy(texto, null));
ok("energia: texto vazio", !textConfirmsEnergy("", 380));

ok("produto citado", sourceMentionsProduct(texto, "Nescau 2.0 em pó"));
ok("produto não citado", !sourceMentionsProduct(texto, "Iogurte grego natural"));
ok("produto sem tokens relevantes", sourceMentionsProduct(texto, "de"));

/* -------------------------------------------------------- prioridade das fontes */

const labelNutrients = {
  kcal: 264,
  carbs: 57.6,
  protein: 8.1,
  fat: 1.4,
  sat_fat: 0.3,
  trans_fat: 0,
  fiber: 4.2,
  sugar: 12.3,
  sodium: 312,
};

const offMatch: OffMatch = {
  code: "7891000053508",
  name: "Achocolatado em pó",
  brands: "Nescau",
  servingSize: "20 g",
  servingQuantity: 20,
  ingredients: "Açúcar, cacau, maltodextrina.",
  nutrients: sanitizeNutrients({
    kcal: 380,
    carbs: 84,
    protein: 4,
    fat: 2,
    sat_fat: 1,
    trans_fat: 0,
    fiber: 3,
    sugar: 80,
    sodium: 100,
  }),
};

const webMatch: WebMatch = {
  sourceName: "TBCA - USP",
  sourceUrl: "https://www.tbca.net.br/base-dados/banana-prata.html",
  productName: "Banana prata",
  nutrients: sanitizeNutrients({
    kcal: 98,
    carbs: 26,
    protein: 1.3,
    fat: 0.1,
    sat_fat: null,
    trans_fat: null,
    fiber: 2,
    sugar: 15,
    sodium: 1,
  }),
  servingSize: "1 unidade média",
  servingGrams: 90,
  ingredients: null,
};

const basePayload: AiFoodPayload = {
  ok: true,
  name: "Biscoito integral de aveia",
  brand: "Marca Teste",
  variant: "integral",
  category: "Biscoito",
  confidence: "high",
  packaged: true,
  basis: "100 g",
  label_read: true,
  barcode: "7891000053508",
  serving_size_text: "3 biscoitos",
  serving_grams: 30,
  label: labelNutrients,
  ingredients: "Farinha de trigo integral, aveia, açúcar mascavo.",
  better_choices: [{ name: "Aveia em flocos", why: "Mais fibra." }],
  balance_tips: ["Combine com uma fruta."],
  problem: null,
};

const comRotulo = composeAnalysis(basePayload, { off: offMatch, web: webMatch }, "lose");
check("prioridade: rótulo vence base e web", comRotulo.origin, "label");
check("prioridade: valores do rótulo", comRotulo.per100.kcal, 264);
check("prioridade: kcal da porção", comRotulo.portion.nutrients.kcal, 79);
check("prioridade: porção", comRotulo.portion.label, "3 biscoitos");
check("prioridade: objetivo gravado", comRotulo.goal, "lose");
check("prioridade: sem link externo", comRotulo.source_url, null);
check(
  "prioridade: fonte do rótulo",
  comRotulo.source_name,
  "Tabela nutricional da própria embalagem",
);
check("rótulo: variante preservada", comRotulo.variant, "integral");
check("rótulo: confiança da IA", comRotulo.confidence, "high");
check("rótulo: rótulo legível não tem ressalva", comRotulo.source_note, null);

const semRotulo: AiFoodPayload = { ...basePayload, label_read: false, label: {} };

const comOff = composeAnalysis(semRotulo, { off: offMatch }, "gain");
check("base: origem", comOff.origin, "openfoodfacts");
check("base: valores", comOff.per100.kcal, 380);
check("base: link", comOff.source_url, "https://world.openfoodfacts.org/product/7891000053508");
check("base: fonte", comOff.source_name, "Achocolatado em pó · Nescau");
check("base: não mistura rótulo", comOff.per100.sugar, 80);
check("base: porção da IA", comOff.portion.grams, 30);
ok(
  "base: avisa sobre versão diferente",
  typeof comOff.source_note === "string" && comOff.source_note.includes("Achocolatado em pó"),
);

const semPorcao = composeAnalysis({ ...semRotulo, serving_grams: null }, { off: offMatch }, "gain");
check("base: porção da base", semPorcao.portion.grams, 20);
check("base: rótulo da porção da base", semPorcao.portion.label, "20 g");

const semIngredientes = composeAnalysis(
  { ...semRotulo, ingredients: null },
  { off: offMatch },
  "gain",
);
check("base: ingredientes da base", semIngredientes.ingredients, "Açúcar, cacau, maltodextrina.");

const daWeb = composeAnalysis(
  {
    ok: true,
    name: "Banana prata",
    brand: null,
    confidence: "medium",
    packaged: false,
    basis: "100 g",
    label_read: false,
    serving_grams: null,
  },
  { off: null, web: webMatch },
  "maintain",
);
check("web: origem", daWeb.origin, "web");
check("web: valores da fonte", daWeb.per100.kcal, 98);
check("web: link da fonte", daWeb.source_url, webMatch.sourceUrl);
check("web: nome da fonte", daWeb.source_name, "TBCA - USP");
check("web: porção da fonte", daWeb.portion.grams, 90);
check("web: sem ressalva quando é o mesmo nome", daWeb.source_note, null);
check("web: solicitou quantidade? porção padrão", daWeb.portion.nutrients.kcal, 88);

const outraVersao = composeAnalysis(
  { ok: true, name: "Banana prata", confidence: "low", packaged: false },
  {
    web: { ...webMatch, productName: "Banana nanica" },
  },
  "know",
);
ok(
  "web: avisa quando a fonte é de outra versão",
  typeof outraVersao.source_note === "string" && outraVersao.source_note.includes("Banana nanica"),
);

const semFonte = composeAnalysis(
  { ...semRotulo, problem: null },
  {},
  "lose",
);
check("sem dados: origem desconhecida", semFonte.origin, "unknown");
check("sem dados: nenhum valor inventado", semFonte.per100, EMPTY_NUTRIENTS);
check("sem dados: porção sem valores", semFonte.portion.nutrients, EMPTY_NUTRIENTS);
ok(
  "sem dados: explica que não achou fonte",
  typeof semFonte.problem === "string" && semFonte.problem.includes("não achei uma fonte confiável"),
);
check("sem dados: veredito neutro", semFonte.fit.verdict, "balanced");
check("sem dados: nenhum ponto positivo", semFonte.benefits, []);

const nada = composeAnalysis(
  { ...semRotulo, label: {}, problem: "Tabela ilegível." },
  {},
  "lose",
);
check("sem dados: mensagem da IA preservada", nada.problem, "Tabela ilegível.");

const ilegivel = composeAnalysis(
  { ok: false, name: "", problem: "Não consegui identificar o produto nesta foto." },
  {},
  "gain",
);
check("ilegível: ok=false", ilegivel.ok, false);
check("ilegível: mensagem", ilegivel.problem, "Não consegui identificar o produto nesta foto.");
check("ilegível: objetivo", ilegivel.goal, "gain");
check("ilegível: confiança baixa", ilegivel.confidence, "low");

const vazio = composeAnalysis({}, {}, "know");
check("vazio: ok=false", vazio.ok, false);
ok("vazio: pede outra foto ou nome e marca", typeof vazio.problem === "string" && vazio.problem.includes("nome e a marca"));

const semConfianca = composeAnalysis({ ...basePayload, confidence: "altíssima" }, {}, "know");
check("confiança: valor inválido vira média", semConfianca.confidence, "medium");

const absurdo = composeAnalysis(
  {
    ...basePayload,
    label: { ...labelNutrients, kcal: 5000, sodium: 999999, fat: -3 },
    confidence: "low",
    better_choices: [
      { name: "Aveia", why: "Mais fibra" },
      { name: "Sem motivo", why: "" },
      { name: "Iogurte", why: "Proteína" },
      { name: "Banana", why: "Potássio" },
      { name: "Extra", why: "Ignorado" },
    ],
    balance_tips: ["  dica 1  ", "dica 2", "dica 3", "dica 4", "dica 5"],
  },
  {},
  "lose",
);
check("saneamento: kcal absurda", absurdo.per100.kcal, null);
check("saneamento: gordura negativa", absurdo.per100.fat, null);
check("saneamento: sódio absurdo", absurdo.per100.sodium, null);
check("saneamento: confiança baixa", absurdo.confidence, "low");
ok(
  "saneamento: benefícios vêm dos números",
  absurdo.benefits.some((item) => item.includes("fibras")),
);
check(
  "saneamento: 3 sugestões",
  absurdo.better_choices.map((s) => s.name),
  ["Aveia", "Iogurte", "Banana"],
);
check("saneamento: dicas", absurdo.balance_tips, ["dica 1", "dica 2", "dica 3", "dica 4"]);

const parcial = composeAnalysis(
  {
    ...basePayload,
    label: {
      kcal: 120,
      carbs: 20,
      protein: 3,
      fat: null,
      sat_fat: null,
      trans_fat: null,
      fiber: null,
      sugar: null,
      sodium: null,
    },
  },
  {},
  "know",
);
check("rótulo parcial: origem", parcial.origin, "label");
check("rótulo parcial: gordura não é preenchida", parcial.per100.fat, null);
check("rótulo parcial: kcal", parcial.per100.kcal, 120);

const bebidaWeb: WebMatch = {
  sourceName: "Site do fabricante",
  sourceUrl: "https://exemplo.com.br/refrigerante-cola",
  productName: "Refrigerante cola",
  nutrients: sanitizeNutrients({ kcal: 42, carbs: 10.6, sugar: 10.6, sodium: 4 }),
  servingSize: "1 lata",
  servingGrams: 350,
  ingredients: null,
};

const bebida = composeAnalysis(
  {
    ok: true,
    name: "Refrigerante cola",
    basis: "100 ml",
    label_read: false,
    serving_size_text: "1 lata",
    serving_grams: 350,
  },
  { web: bebidaWeb },
  "know",
);
check("bebida: base", bebida.basis, "100 ml");
check("bebida: kcal por lata", bebida.portion.nutrients.kcal, 147);
check("bebida: formatação", fmtPortion(bebida.portion, bebida.basis), "1 lata (350 ml)");

/* -------------------------------------------------------------- avaliação */

const ruim = sanitizeNutrients({
  kcal: 450,
  carbs: 60,
  protein: 4,
  fat: 20,
  sat_fat: 9,
  trans_fat: 0.5,
  fiber: 0,
  sugar: 30,
  sodium: 900,
});
const fitRuim = evaluateFit(ruim, "lose");
check("veredito: produto ruim para emagrecer", fitRuim.verdict, "alternative");
ok(
  "veredito: motivo cita os números",
  fitRuim.reason.includes("30,0 g de açúcares") && fitRuim.reason.includes("emagrecer"),
);

const proteico = sanitizeNutrients({ kcal: 350, protein: 20, fat: 6, sat_fat: 2 });
check("veredito: proteico para ganhar massa", evaluateFit(proteico, "gain").verdict, "good");

const leve = sanitizeNutrients({ kcal: 90, fiber: 4, sugar: 3, sat_fat: 0.5, sodium: 40 });
check("veredito: leve é boa opção", evaluateFit(leve, "lose").verdict, "good");
check("veredito: conhecer valores é neutro", evaluateFit(leve, "know").verdict, "balanced");

const vazioFit = evaluateFit(EMPTY_NUTRIENTS, "lose");
check("veredito: sem dados é neutro", vazioFit.verdict, "balanced");
ok("veredito: sem dados explica", vazioFit.reason.includes("Sem valores nutricionais"));

check("benefícios: nenhum com valores altos", deriveBenefits(ruim), []);
check("atenção: lista excessos", deriveCautions(ruim).length, 4);
ok(
  "atenção: cita a gordura trans",
  deriveCautions(ruim).some((item) => item.includes("trans")),
);
ok(
  "benefícios: cita fibras",
  deriveBenefits(leve).some((item) => item.includes("Fibras") || item.includes("fibras")),
);

/* ----------------------------------------------------------------- histórico */

const store = fakeStore();
const analysis: FoodAnalysis = comRotulo;
const entryA: HistoryEntry = { id: "a", at: 1, goal: "lose", analysis };
const entryB: HistoryEntry = { id: "b", at: 2, goal: "gain", analysis };

check("histórico: começa vazio", readHistory(store, "u1"), []);
let history = addHistory(store, "u1", entryA);
history = addHistory(store, "u1", entryB);
check(
  "histórico: mais novo primeiro",
  history.map((e) => e.id),
  ["b", "a"],
);
check("histórico: isolado por usuário", readHistory(store, "u2"), []);
check(
  "histórico: mesmo id não duplica",
  addHistory(store, "u1", { ...entryA, at: 3 }).map((e) => e.id),
  ["a", "b"],
);

for (let i = 0; i < 20; i += 1) {
  addHistory(store, "u1", { id: `x${i}`, at: i, goal: "know", analysis });
}
check("histórico: limite", readHistory(store, "u1").length, HISTORY_LIMIT);
check(
  "histórico: exclusão",
  removeHistory(store, "u1", "x19").some((e) => e.id === "x19"),
  false,
);
check("histórico: limpar", clearHistory(store, "u1"), []);
check("histórico: chave removida", store.map.has(historyKey("u1")), false);

const corrompido = fakeStore();
corrompido.setItem(historyKey("u1"), "{não é json");
check("histórico: json inválido", readHistory(corrompido, "u1"), []);

const metas = fakeStore();
check("objetivo: padrão", readGoal(metas, "u1"), "know");
writeGoal(metas, "u1", "gain");
check("objetivo: salvo", readGoal(metas, "u1"), "gain");
check("objetivo: isolado", readGoal(metas, "u2"), "know");
check("objetivo: rótulo", goalLabel("lose"), "Emagrecer com saúde");
check("resumo do histórico", historySummary(entryA), "79 kcal por porção · Lido do rótulo da foto");

ok("hasNutrition: vazio", hasNutrition(EMPTY_NUTRIENTS) === false);
ok("hasNutrition: parcial", hasNutrition({ ...EMPTY_NUTRIENTS, kcal: 10 }) === true);

/* ------------------------------------------------------------------- rótulos */

check("origem: rótulo", ORIGIN_LABELS.label, "Lido do rótulo da foto");
check("origem: web", ORIGIN_LABELS.web, "Pesquisa na internet");
check("origem: sem dados", ORIGIN_LABELS.unknown, "Sem dados confiáveis");
check("confiança: alta", CONFIDENCE_LABELS.high, "Identificação com alta confiança");
check("confiança: baixa", CONFIDENCE_LABELS.low, "Identificação incerta");

console.log(`\n${passed} passaram, ${failures} falharam`);
if (failures > 0) process.exit(1);

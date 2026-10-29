// Testes da seção "Calorias" (helpers puros + prioridade das fontes).
//   node scripts/calorias.test.ts
//
// Não usa rede, IA, Supabase nem conta de usuário: só funções puras de
// src/lib/nutrition.ts.

import {
  EMPTY_NUTRIENTS,
  HISTORY_LIMIT,
  addHistory,
  buildPortion,
  clearHistory,
  composeAnalysis,
  fmtGrams,
  fmtKcal,
  fmtPortion,
  fmtSodium,
  goalLabel,
  hasNutrition,
  historyKey,
  historySummary,
  nameMatchScore,
  nutrientsFromOpenFoodFacts,
  readGoal,
  readHistory,
  removeHistory,
  sanitizeNutrients,
  toNumber,
  writeGoal,
  type AiFoodPayload,
  type FoodAnalysis,
  type HistoryEntry,
  type OffMatch,
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

const estimateNutrients = {
  kcal: 400,
  carbs: 50,
  protein: 5,
  fat: 18,
  sat_fat: 8,
  trans_fat: null,
  fiber: 1,
  sugar: 30,
  sodium: 800,
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

const basePayload: AiFoodPayload = {
  ok: true,
  name: "Biscoito integral de aveia",
  brand: "Marca Teste",
  category: "Biscoito",
  basis: "100 g",
  label_read: true,
  barcode: "7891000053508",
  serving_size_text: "3 biscoitos",
  serving_grams: 30,
  label: labelNutrients,
  estimate: estimateNutrients,
  ingredients: "Farinha de trigo integral, aveia, açúcar mascavo.",
  benefits: ["Fonte de fibras", "Aveia integral"],
  cautions: ["12,3 g de açúcares por 100 g"],
  verdict: "balanced",
  verdict_reason: "Cabe como lanche.",
  better_choices: [{ name: "Aveia em flocos", why: "Mais fibra." }],
  balance_tips: ["Combine com uma fruta."],
  problem: null,
};

const comRotulo = composeAnalysis(basePayload, offMatch, "lose");
check("prioridade: rótulo vence a base", comRotulo.origin, "label");
check("prioridade: valores do rótulo", comRotulo.per100.kcal, 264);
check("prioridade: kcal da porção", comRotulo.portion.nutrients.kcal, 79);
check("prioridade: porção", comRotulo.portion.label, "3 biscoitos");
check("prioridade: objetivo gravado", comRotulo.goal, "lose");
check("prioridade: sem link externo", comRotulo.source_url, null);

const semRotulo: AiFoodPayload = { ...basePayload, label_read: false, label: {} };
const comOff = composeAnalysis(semRotulo, offMatch, "gain");
check("base: origem", comOff.origin, "openfoodfacts");
check("base: valores", comOff.per100.kcal, 380);
check("base: link", comOff.source_url, "https://world.openfoodfacts.org/product/7891000053508");
check("base: fonte", comOff.source_name, "Achocolatado em pó · Nescau");
check("base: não mistura estimativa", comOff.per100.fat, 2);
check("base: porção da IA", comOff.portion.grams, 30);

const semPorcao = composeAnalysis({ ...semRotulo, serving_grams: null }, offMatch, "gain");
check("base: porção da base", semPorcao.portion.grams, 20);
check("base: rótulo da porção da base", semPorcao.portion.label, "20 g");

const semIngredientes = composeAnalysis({ ...semRotulo, ingredients: null }, offMatch, "gain");
check("base: ingredientes da base", semIngredientes.ingredients, "Açúcar, cacau, maltodextrina.");

const estimado = composeAnalysis(semRotulo, null, "maintain");
check("estimativa: origem", estimado.origin, "estimate");
check("estimativa: valores", estimado.per100.kcal, 400);
check("estimativa: sem link", estimado.source_url, null);

const nada = composeAnalysis(
  { ...semRotulo, estimate: {}, problem: "Tabela ilegível." },
  null,
  "lose",
);
check("sem dados: origem", nada.origin, "unknown");
check("sem dados: nenhum valor", nada.per100, EMPTY_NUTRIENTS);
check("sem dados: problema", nada.problem, "Tabela ilegível.");
check("sem dados: veredito neutro", nada.fit.verdict, "balanced");

const ilegivel = composeAnalysis(
  { ok: false, name: "", problem: "Não consegui identificar o alimento na foto." },
  null,
  "gain",
);
check("ilegível: ok=false", ilegivel.ok, false);
check("ilegível: mensagem", ilegivel.problem, "Não consegui identificar o alimento na foto.");
check("ilegível: objetivo", ilegivel.goal, "gain");

const vazio = composeAnalysis({}, null, "know");
check("vazio: ok=false", vazio.ok, false);
ok("vazio: tem mensagem", typeof vazio.problem === "string" && vazio.problem.length > 5);

const absurdo = composeAnalysis(
  {
    ...basePayload,
    label: { ...labelNutrients, kcal: 5000, sodium: 999999, fat: -3 },
    verdict: "proibido",
    verdict_reason: null,
    benefits: ["  ok  ", "", 42, "outro"],
    better_choices: [
      { name: "Aveia", why: "Mais fibra" },
      { name: "Sem motivo", why: "" },
      { name: "Iogurte", why: "Proteína" },
      { name: "Banana", why: "Potássio" },
      { name: "Extra", why: "Ignorado" },
    ],
    balance_tips: ["  dica 1  ", "dica 2", "dica 3", "dica 4", "dica 5"],
  },
  null,
  "lose",
);
check("saneamento: kcal absurda", absurdo.per100.kcal, null);
check("saneamento: gordura negativa", absurdo.per100.fat, null);
check("saneamento: sódio absurdo", absurdo.per100.sodium, null);
check("saneamento: veredito inválido", absurdo.fit.verdict, "balanced");
ok(
  "saneamento: motivo padrão",
  typeof absurdo.fit.reason === "string" && absurdo.fit.reason.length > 5,
);
check("saneamento: benefícios", absurdo.benefits, ["ok", "outro"]);
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
  null,
  "know",
);
check("rótulo parcial: origem", parcial.origin, "label");
check("rótulo parcial: gordura não é preenchida", parcial.per100.fat, null);
check("rótulo parcial: kcal", parcial.per100.kcal, 120);

const bebida = composeAnalysis(
  {
    ...basePayload,
    name: "Refrigerante cola",
    basis: "100 ml",
    label_read: false,
    label: {},
    estimate: {
      kcal: 42,
      carbs: 10.6,
      protein: 0,
      fat: 0,
      sat_fat: null,
      trans_fat: null,
      fiber: null,
      sugar: 10.6,
      sodium: 4,
    },
    serving_size_text: "1 lata",
    serving_grams: 350,
  },
  null,
  "know",
);
check("bebida: base", bebida.basis, "100 ml");
check("bebida: kcal por lata", bebida.portion.nutrients.kcal, 147);
check("bebida: formatação", fmtPortion(bebida.portion, bebida.basis), "1 lata (350 ml)");

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
check("resumo do histórico", historySummary(entryA), "79 kcal por porção · Lido do rótulo");

ok("hasNutrition: vazio", hasNutrition(EMPTY_NUTRIENTS) === false);
ok("hasNutrition: parcial", hasNutrition({ ...EMPTY_NUTRIENTS, kcal: 10 }) === true);

console.log(`\n${passed} passaram, ${failures} falharam`);
if (failures > 0) process.exit(1);

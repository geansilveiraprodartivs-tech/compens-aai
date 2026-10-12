// Teste do cálculo de economia (fluxo obrigatório).
//   node scripts/savings.test.ts
//
// Usa apenas números de teste — nada é gravado no banco nem na conta do usuário.

import {
  compareOptions,
  decodePurchaseNote,
  encodePurchaseNote,
  lineSavings,
  referenceForOption,
  round2,
  selectPurchaseItems,
  summarizePurchase,
  type CompareOption,
  type PricedItem,
} from "../src/lib/savings.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> recebido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)}`}`);
}

/* ---------------- Fluxo obrigatório: A(10 -> 8, qtd 2) e B(15 -> 15, qtd 1) ---------------- */

const items: PricedItem[] = [
  { name: "A", quantity: 2, unit: "un", price: 8, reference_price: 10 },
  { name: "B", quantity: 1, unit: "un", price: 15, reference_price: 15 },
];

check("economia por produto A", lineSavings(items[0]).saving, 4);
check("economia por produto B", lineSavings(items[1]).saving, 0);

const s = summarizePurchase(items);
check("economia total da compra", s.savingTotal, 4);
check("total pago", s.paidTotal, 31);
check("total de referencia", s.referenceTotal, 35);
check("total acima da referencia", s.overpayTotal, 0);
check("quantidade de produtos", s.itemsCount, 2);
check("unidades somadas", s.unitsCount, 3);
check("produtos que geraram economia", s.savingItems.map((i) => i.name), ["A"]);

const over = summarizePurchase([
  { name: "C", quantity: 2, unit: "un", price: 7, reference_price: 5 },
]);
check("pagar acima da referencia nao e economia", over.savingTotal, 0);
check("pagar acima registra diferenca separada", over.overpayTotal, 4);

const semPreco = summarizePurchase([
  { name: "D", quantity: 1, unit: "un", price: 0, reference_price: 10 },
]);
check("sem preco pago = economia 0", semPreco.savingTotal, 0);

/* --------------------------------- Comparacao --------------------------------- */

const options: CompareOption[] = [
  { id: "1", label: "A 500g", store: "Mercado X", price: 5, quantity: 500, unit: "g" },
  { id: "2", label: "B 1kg", store: "Mercado Y", price: 8, quantity: 1, unit: "kg" },
  { id: "3", label: "C 500g", store: "Mercado Z", price: 5.5, quantity: 500, unit: "g" },
];
const comparison = compareOptions(options);
check("melhor opcao normalizada (1 kg = 1000 g)", comparison.best?.label, "B 1kg");
check("menor preco por kg", round2(comparison.best?.perBase ?? 0), 8);
check("economia potencial da comparacao", comparison.potentialSaving, 1.5);
check("ha comparacao suficiente", comparison.hasComparison, true);
check("estabelecimento com menor preco", comparison.bestStore, "Mercado Y");

const refC = referenceForOption(options[2], comparison);
check("referencia preservada ao adicionar", refC, 8);
const itemC: PricedItem = {
  name: "C 500g",
  quantity: 0.5,
  unit: "kg",
  price: round2(5.5 / 0.5),
  reference_price: refC,
};
check("economia negativa ao escolher a opcao mais cara", lineSavings(itemC).saving, 0);
check("diferenca acima da referencia", lineSavings(itemC).overpay, 1.5);

check("uma opcao nao e comparacao", compareOptions([options[0]]).hasComparison, false);

const mixed = compareOptions([
  { id: "1", label: "Arroz 1kg", store: "", price: 8, quantity: 1, unit: "kg" },
  { id: "2", label: "Leite 1L", store: "", price: 5, quantity: 1, unit: "L" },
]);
check("medidas diferentes nao comparam", mixed.comparable, false);
check("sem comparacao em medidas diferentes", mixed.hasComparison, false);

/* ---------------------------- Selecao e persistencia ---------------------------- */

check(
  "itens marcados entram na compra",
  selectPurchaseItems([{ checked: true }, { checked: false }]).length,
  1,
);
check(
  "sem marcacao usa a lista inteira",
  selectPurchaseItems([{ checked: false }, { checked: false }]).length,
  2,
);

const note = encodePurchaseNote(s);
check("nota persistida recupera o resumo", decodePurchaseNote(note)?.savingTotal, 4);
check("nota invalida retorna nulo", decodePurchaseNote("nada"), null);

/* ----------------------------------- Resultado ----------------------------------- */

console.log("");
if (failures > 0) {
  console.log(`${failures} teste(s) falharam.`);
  process.exit(1);
}
console.log("Todos os testes passaram.");

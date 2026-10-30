// Testes do interpretador de voz da lista de compras (pt-BR).
//
// Roda com:  node scripts/voiceList.test.ts
//
// Cobre o problema relatado: falar vários produtos numa frase só precisa gerar
// uma linha por produto — inclusive quando o reconhecedor devolve a fala SEM
// vírgulas (caso do plugin nativo do APK) — sem repetir itens.

import assert from "node:assert/strict";
import {
  appendTranscriptChunks,
  parseVoiceProducts,
  productKey,
  type VoiceDraft,
} from "../src/lib/voiceList.ts";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${(error as Error).message.split("\n").join("\n    ")}`);
  }
}

/** Só os nomes, em ordem — é o que vira linha na lista. */
function names(transcript: string): string[] {
  return parseVoiceProducts(transcript).map((item) => item.name);
}

function summary(transcript: string): string[] {
  return parseVoiceProducts(transcript).map(
    (item) => `${item.name}|${item.quantity}|${item.unit}|${item.price ?? "-"}`,
  );
}

function assertNames(transcript: string, expected: string[]) {
  assert.deepEqual(names(transcript), expected, `fala: "${transcript}"`);
}

/* ---------------------------------------------- frases obrigatórias (com pausa) */

const REQUIRED = [
  {
    spoken: "Batata, carne, arroz e feijão.",
    expected: ["Batata", "Carne", "Arroz", "Feijão"],
  },
  {
    spoken: "Leite em pó, pão, queijo e presunto.",
    expected: ["Leite em pó", "Pão", "Queijo", "Presunto"],
  },
  {
    spoken: "Arroz integral, feijão preto e carne moída.",
    expected: ["Arroz integral", "Feijão preto", "Carne moída"],
  },
  {
    spoken: "Maçã, banana, laranja e mamão.",
    expected: ["Maçã", "Banana", "Laranja", "Mamão"],
  },
];

for (const { spoken, expected } of REQUIRED) {
  test(`frase obrigatória: ${spoken}`, () => assertNames(spoken, expected));
}

test("frase obrigatória com quantidades: dois quilos de batata, um quilo de arroz e três caixas de leite", () => {
  assert.deepEqual(summary("Dois quilos de batata, um quilo de arroz e três caixas de leite."), [
    "Batata|2|kg|-",
    "Arroz|1|kg|-",
    "Leite|3|un|-",
  ]);
});

/* ------------------------------------ mesma fala sem vírgulas (plugin nativo) */

for (const { spoken, expected } of REQUIRED) {
  const withoutPauses = spoken.replace(/[.,]/g, "");
  test(`sem pontuação: ${withoutPauses}`, () => assertNames(withoutPauses, expected));
}

test("sem pontuação e com quantidade: dois quilos de batata um quilo de arroz e três caixas de leite", () => {
  assert.deepEqual(summary("Dois quilos de batata um quilo de arroz e três caixas de leite"), [
    "Batata|2|kg|-",
    "Arroz|1|kg|-",
    "Leite|3|un|-",
  ]);
});

test("sem pontuação: leite em pó pão queijo e presunto", () => {
  assertNames("Leite em pó pão queijo e presunto", ["Leite em pó", "Pão", "Queijo", "Presunto"]);
});

test("sem pontuação: arroz integral feijão preto e carne moída", () => {
  assertNames("Arroz integral feijão preto e carne moída", [
    "Arroz integral",
    "Feijão preto",
    "Carne moída",
  ]);
});

test("sem pontuação: maçã banana laranja e mamão", () => {
  assertNames("Maçã banana laranja e mamão", ["Maçã", "Banana", "Laranja", "Mamão"]);
});

test("frases curtas com ponto: Batata. Carne. Arroz. Feijão.", () => {
  assertNames("Batata. Carne. Arroz. Feijão.", ["Batata", "Carne", "Arroz", "Feijão"]);
});

/* -------------------------------------------------------- nomes compostos */

test("mantém nomes compostos com preposição", () => {
  assertNames("óleo de soja e leite em pó", ["Óleo de soja", "Leite em pó"]);
  assertNames("pão de queijo e suco de laranja", ["Pão de queijo", "Suco de laranja"]);
  assertNames("café com leite e carne de porco", ["Café com leite", "Carne de porco"]);
  assertNames("creme de leite e molho de tomate", ["Creme de leite", "Molho de tomate"]);
});

test("não quebra adjetivos em produtos separados", () => {
  assertNames("carne moída", ["Carne moída"]);
  assertNames("feijão preto", ["Feijão preto"]);
  assertNames("açúcar refinado", ["Açúcar refinado"]);
  assertNames("leite integral", ["Leite integral"]);
});

test("mantém variedades que parecem outro produto", () => {
  assertNames("banana maçã", ["Banana maçã"]);
  assertNames("tomate cereja", ["Tomate cereja"]);
  assertNames("vinagre de maçã", ["Vinagre de maçã"]);
  assertNames("banana maçã e tomate cereja", ["Banana maçã", "Tomate cereja"]);
});

/* -------------------------------------------------------------- quantidades */

test("preserva quantidade e unidade", () => {
  assert.deepEqual(summary("dois quilos de batata e um litro de leite"), [
    "Batata|2|kg|-",
    "Leite|1|L|-",
  ]);
  assert.deepEqual(summary("uma dúzia de ovos e meio quilo de queijo"), [
    "Ovos|12|un|-",
    "Queijo|0.5|kg|-",
  ]);
  assert.deepEqual(summary("500 gramas de presunto e 2 litros de suco"), [
    "Presunto|500|g|-",
    "Suco|2|L|-",
  ]);
});

/* ------------------------------------------------------------- sem repetição */

test("não repete o mesmo produto dentro da mesma fala", () => {
  assertNames("batata, batata, carne e carne e batata", ["Batata", "Carne"]);
});

test("não repete em fala sem pontuação", () => {
  assertNames("arroz arroz feijão feijão", ["Arroz", "Feijão"]);
});

test("completa preço/quantidade em vez de criar outra linha", () => {
  // primeira menção sem preço, segunda com preço
  assert.deepEqual(summary("pão e pão por 9,99"), ["Pão|1|un|9.99"]);
});

/* ------------------------------------------------------------------ preços */

test("preços continuam funcionando", () => {
  assert.deepEqual(summary("pão por 9,99 e café por 18,90"), ["Pão|1|un|9.99", "Café|1|un|18.9"]);
  assert.deepEqual(summary("500g de presunto por 13,49"), ["Presunto|500|g|13.49"]);
  assert.deepEqual(summary("três caixas de leite a 2,99 cada"), ["Leite|3|un|8.97"]);
});

/* ------------------------------------------- transcrição repetida/cumulativa */

test("resultado final repetido não duplica a fala", () => {
  let chunks: string[] = [];
  chunks = appendTranscriptChunks(chunks, "Batata, carne, arroz e feijão.");
  chunks = appendTranscriptChunks(chunks, "Batata, carne, arroz e feijão.");
  assert.deepEqual(chunks, ["Batata, carne, arroz e feijão."]);
});

test("resultado final repetido com pontuação diferente é ignorado", () => {
  let chunks: string[] = [];
  chunks = appendTranscriptChunks(chunks, "batata carne arroz");
  chunks = appendTranscriptChunks(chunks, "Batata, carne, arroz.");
  assert.deepEqual(chunks, ["batata carne arroz"]);
});

test("reenvio cumulativo substitui o histórico", () => {
  let chunks: string[] = [];
  chunks = appendTranscriptChunks(chunks, "batata");
  chunks = appendTranscriptChunks(chunks, "batata carne");
  chunks = appendTranscriptChunks(chunks, "batata carne arroz e feijão");
  assert.deepEqual(chunks, ["batata carne arroz e feijão"]);
  assertNames(chunks.join(" "), ["Batata", "Carne", "Arroz", "Feijão"]);
});

test("trechos novos continuam sendo anexados", () => {
  let chunks: string[] = [];
  chunks = appendTranscriptChunks(chunks, "batata, carne");
  chunks = appendTranscriptChunks(chunks, "arroz e feijão");
  assert.deepEqual(chunks, ["batata, carne", "arroz e feijão"]);
  assertNames(chunks.join(" "), ["Batata", "Carne", "Arroz", "Feijão"]);
});

test("produto repetido depois de outro trecho é ignorado", () => {
  let chunks: string[] = [];
  chunks = appendTranscriptChunks(chunks, "batata");
  chunks = appendTranscriptChunks(chunks, "carne");
  chunks = appendTranscriptChunks(chunks, "batata");
  assert.deepEqual(chunks, ["batata", "carne"]);
});

test("fala vazia não altera nada", () => {
  assert.deepEqual(appendTranscriptChunks(["batata"], "   "), ["batata"]);
});

/* ------------------------------------------- linha final (o que vai ao banco) */

test("chave de comparação ignora acento e pontuação", () => {
  assert.equal(productKey("Óleo de soja"), productKey("oleo  de SOJA."));
});

test("o item enviado à lista tem nome único por linha", () => {
  const drafts: VoiceDraft[] = parseVoiceProducts(
    "Batata, carne, arroz e feijão. Batata, carne, arroz e feijão.",
  );
  const keys = drafts.map((draft) => productKey(draft.name));
  assert.equal(new Set(keys).size, keys.length, "nomes repetidos na mesma leva");
  assert.deepEqual(
    drafts.map((draft) => draft.name),
    ["Batata", "Carne", "Arroz", "Feijão"],
  );
});

/* ------------------------------------------------------------------ resumo */

if (failures.length > 0) {
  console.error(`\n${failures.length} teste(s) falharam:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log(`\n✓ ${passed} casos de voz passaram.`);

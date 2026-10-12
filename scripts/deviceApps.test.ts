// Teste da descoberta de apps do dispositivo e das preferências
// (banco padrão / carteira digital).
//   node scripts/deviceApps.test.ts
//
// Usa apenas dados fictícios — nada é gravado no aparelho real nem na conta do usuário.

import {
  emptyBankPrefs,
  loadBankPrefs,
  normalizeDeviceApps,
  saveBankPrefs,
  type RawDeviceApp,
} from "../src/lib/pix.ts";

// localStorage mínimo para rodar fora do navegador.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> recebido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)}`}`,
  );
}

/* ---------------- normalizeDeviceApps (mapeamento da descoberta nativa) ---------------- */

check("lista vazia", normalizeDeviceApps(undefined), []);

const raw: RawDeviceApp[] = [
  {
    package: "com.c6bank.app",
    name: "C6 Bank",
    category: "bank",
    financial: true,
    icon: "data:image/png;base64,AAA",
  },
  { package: "com.picpay", name: "PicPay", category: "wallet", financial: true },
  { package: "com.foo.other", name: "", category: "weird", financial: false },
  { name: "Sem pacote", category: "bank" },
];

check("mapeia e ordena por nome", normalizeDeviceApps(raw), [
  {
    package: "com.c6bank.app",
    name: "C6 Bank",
    category: "bank",
    financial: true,
    icon: "data:image/png;base64,AAA",
  },
  { package: "com.foo.other", name: "com.foo.other", category: "other", financial: false },
  { package: "com.picpay", name: "PicPay", category: "wallet", financial: true },
]);

check("descarta entrada sem package", normalizeDeviceApps([{ name: "X", category: "bank" }]), []);

check(
  "usa label como nome quando name ausente",
  normalizeDeviceApps([{ package: "com.a", label: "Banco A", category: "bank", financial: true }]),
  [{ package: "com.a", name: "Banco A", category: "bank", financial: true }],
);

check(
  "financial derivado da categoria mesmo sem flag",
  normalizeDeviceApps([{ package: "com.b", name: "B", category: "bank" }]),
  [{ package: "com.b", name: "B", category: "bank", financial: true }],
);

check(
  "financial explícito vence em categoria 'other'",
  normalizeDeviceApps([{ package: "com.c", name: "C", category: "other", financial: true }]),
  [{ package: "com.c", name: "C", category: "other", financial: true }],
);

/* ---------------- Preferências (banco padrão e carteira, por usuário) ---------------- */

const userA = "user-a";
const userB = "user-b";

check("prefs vazias antes de salvar", loadBankPrefs(userA), emptyBankPrefs());

const bankA = normalizeDeviceApps([
  { package: "com.nu.production", name: "Nubank", category: "bank" },
])[0];
const walletA = normalizeDeviceApps([
  { package: "com.picpay", name: "PicPay", category: "wallet" },
])[0];

saveBankPrefs(userA, { bank: bankA, wallet: walletA });
check("persiste banco padrão e carteira", loadBankPrefs(userA), { bank: bankA, wallet: walletA });

// Escolhas independentes: trocar o banco não altera a carteira.
const bankA2 = normalizeDeviceApps([{ package: "com.itau", name: "Itaú", category: "bank" }])[0];
saveBankPrefs(userA, { bank: bankA2, wallet: walletA });
check("trocar banco mantém carteira", loadBankPrefs(userA), { bank: bankA2, wallet: walletA });

// Isolamento entre usuários.
check("prefs de outro usuário não são afetadas", loadBankPrefs(userB), emptyBankPrefs());

// Nenhum banco padrão duplicado: o objeto guarda um único banco.
saveBankPrefs(userA, { bank: bankA, wallet: null });
check("um único banco padrão", loadBankPrefs(userA), { bank: bankA, wallet: null });

// Dados corrompidos não quebram.
store.set("compensai.bankPrefs.v1.corrupt", "{ isso não é json }");
check("json inválido vira prefs vazias", loadBankPrefs("corrupt"), emptyBankPrefs());
store.set("compensai.bankPrefs.v1.badshape", JSON.stringify({ bank: 123, wallet: { x: 1 } }));
check("formato inválido vira prefs vazias", loadBankPrefs("badshape"), emptyBankPrefs());

console.log(failures === 0 ? "\nTodos os testes passaram." : `\n${failures} teste(s) falharam.`);
process.exit(failures === 0 ? 0 : 1);

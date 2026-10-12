// Histórico local das comparações feitas no menu Comparar.
// Persiste no aparelho (localStorage) para sobreviver a recarregar/fechar.

import type { CompareOption } from "@/lib/savings";

export type ComparisonRecord = {
  id: string;
  at: number;
  product: string;
  options: CompareOption[];
  bestLabel: string | null;
  bestStore: string | null;
  bestPerBase: number;
  worstPerBase: number;
  potentialSaving: number;
  comparable: boolean;
};

const KEY = "compensai.comparisons.v1";
const LIMIT = 50;

export function loadComparisons(): ComparisonRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ComparisonRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveComparison(record: ComparisonRecord): ComparisonRecord[] {
  const next = [record, ...loadComparisons()].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearComparisons(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

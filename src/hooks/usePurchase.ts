import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  encodePurchaseNote,
  selectPurchaseItems,
  summarizePurchase,
  type PurchaseSummary,
} from "@/lib/savings";
import type { ListItem } from "@/hooks/useList";

export type PurchaseResult = {
  sessionId: string;
  summary: PurchaseSummary;
};

/**
 * Confirma a compra da lista ativa: grava a sessão, a economia (com o
 * detalhamento por produto em `savings_records.note`) e o pagamento, e conclui
 * a lista. Bloqueia registrar a mesma compra duas vezes.
 */
export function usePurchase(listId: string | undefined, items: ListItem[]) {
  const qc = useQueryClient();

  const confirm = useMutation({
    mutationFn: async (): Promise<PurchaseResult> => {
      if (!listId) throw new Error("Sem lista ativa para concluir.");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada.");
      const uid = auth.user.id;

      const { data: existing, error: existingError } = await supabase
        .from("shopping_sessions")
        .select("id")
        .eq("list_id", listId)
        .eq("status", "finished")
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) throw new Error("Esta compra já foi registrada.");

      const chosen = selectPurchaseItems(items);
      if (chosen.length === 0) throw new Error("Sua lista está vazia.");

      const summary = summarizePurchase(chosen);

      const { data: session, error: sessionError } = await supabase
        .from("shopping_sessions")
        .insert({
          user_id: uid,
          list_id: listId,
          total_spent: summary.paidTotal,
          items_count: summary.itemsCount,
          promotions_used: summary.savingItems.length,
          status: "finished",
          finished_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;

      const { error: savingsError } = await supabase.from("savings_records").insert({
        user_id: uid,
        session_id: session.id,
        real_savings: summary.savingTotal,
        potential_savings: 0,
        note: encodePurchaseNote(summary),
      });
      if (savingsError) throw savingsError;

      await supabase.from("purchase_payments").insert({
        user_id: uid,
        method: "pix",
        status: "paid",
        paid_at: new Date().toISOString(),
      });

      const { error: listError } = await supabase
        .from("shopping_lists")
        .update({ status: "finished" })
        .eq("id", listId);
      if (listError) throw listError;

      return { sessionId: session.id, summary };
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  return { confirm };
}

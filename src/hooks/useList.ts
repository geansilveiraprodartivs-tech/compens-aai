import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ListItem = {
  id: string;
  list_id: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  price: number;
  reference_price: number | null;
  checked: boolean;
};

async function userId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada");
  return data.user.id;
}

/** Lista ativa do usuário (cria uma na primeira vez). */
export function useActiveList() {
  return useQuery({
    queryKey: ["active-list"],
    queryFn: async () => {
      const uid = await userId();
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", uid)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { data: created, error: createError } = await supabase
        .from("shopping_lists")
        .insert({ user_id: uid })
        .select()
        .single();
      if (createError) throw createError;
      return created;
    },
  });
}

export function useListItems(listId?: string) {
  return useQuery({
    queryKey: ["list-items", listId],
    enabled: !!listId,
    queryFn: async (): Promise<ListItem[]> => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("*")
        .eq("list_id", listId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ListItem[];
    },
  });
}

export function useItemMutations(listId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["list-items", listId] });
    qc.invalidateQueries({ queryKey: ["savings"] });
  };

  const add = useMutation({
    mutationFn: async (item: Partial<ListItem>) => {
      const uid = await userId();
      const { error } = await supabase.from("shopping_list_items").insert({
        list_id: listId!,
        user_id: uid,
        name: item.name!,
        brand: item.brand ?? null,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? "un",
        price: item.price ?? 0,
        reference_price: item.reference_price ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ListItem> & { id: string }) => {
      const { error } = await supabase.from("shopping_list_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, update, remove };
}

/** Totais calculados em tempo real a partir dos itens. */
export function listTotals(items: ListItem[]) {
  const total = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const spent = items
    .filter((i) => i.checked)
    .reduce((sum, i) => sum + i.quantity * i.price, 0);
  const realSavings = items
    .filter((i) => i.checked && i.reference_price)
    .reduce((sum, i) => sum + Math.max(0, (i.reference_price! - i.price) * i.quantity), 0);
  const potentialSavings = items
    .filter((i) => !i.checked && i.reference_price)
    .reduce((sum, i) => sum + Math.max(0, (i.reference_price! - i.price) * i.quantity), 0);
  return {
    total,
    spent,
    realSavings,
    potentialSavings,
    checkedCount: items.filter((i) => i.checked).length,
  };
}

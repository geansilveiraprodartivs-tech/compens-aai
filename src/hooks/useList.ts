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
  package_size: number | null;
  package_unit: string | null;
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

export type SavedList = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

/** Listas salvas pelo usuário (para reutilizar depois). */
export function useSavedLists() {
  return useQuery({
    queryKey: ["saved-lists"],
    queryFn: async (): Promise<SavedList[]> => {
      const uid = await userId();
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("id, name, status, created_at")
        .eq("user_id", uid)
        .eq("status", "saved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedList[];
    },
  });
}

export function useListMutations(listId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["active-list"] });
    qc.invalidateQueries({ queryKey: ["saved-lists"] });
    qc.invalidateQueries({ queryKey: ["list-items"] });
  };

  /** Remove todos os itens da lista ativa. */
  const clearAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("shopping_list_items")
        .delete()
        .eq("list_id", listId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Salva a lista ativa com um nome e começa uma lista nova. */
  const saveList = useMutation({
    mutationFn: async (name: string) => {
      const uid = await userId();
      const { error } = await supabase
        .from("shopping_lists")
        .update({ name, status: "saved" })
        .eq("id", listId!);
      if (error) throw error;
      const { error: createError } = await supabase
        .from("shopping_lists")
        .insert({ user_id: uid });
      if (createError) throw createError;
    },
    onSuccess: invalidate,
  });

  /** Renomeia a lista ativa (guarda o nome exatamente como digitado). */
  const renameList = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ name })
        .eq("id", listId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });


  /** Torna uma lista salva a lista ativa (a ativa atual vira salva). */
  const loadList = useMutation({
    mutationFn: async (savedId: string) => {
      if (listId) {
        const { error } = await supabase
          .from("shopping_lists")
          .update({ status: "saved" })
          .eq("id", listId);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("shopping_lists")
        .update({ status: "active" })
        .eq("id", savedId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Apaga uma lista salva e seus itens. */
  const deleteList = useMutation({
    mutationFn: async (savedId: string) => {
      const { error: itemsError } = await supabase
        .from("shopping_list_items")
        .delete()
        .eq("list_id", savedId);
      if (itemsError) throw itemsError;
      const { error } = await supabase.from("shopping_lists").delete().eq("id", savedId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { clearAll, saveList, renameList, loadList, deleteList };
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
        package_size: item.package_size ?? null,
        package_unit: item.package_unit ?? null,
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

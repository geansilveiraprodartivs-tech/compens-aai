-- Guarda, junto do item da lista, o que foi confirmado na análise nutricional:
-- código de barras e os valores por 100 g/ml com a fonte de onde vieram.
--
-- Compatível e não destrutiva:
--   * só adiciona colunas (nenhuma alteração em dados existentes);
--   * todas aceitam NULL, então os itens antigos continuam válidos;
--   * o app funciona sem esta migração (grava apenas o subconjunto antigo e
--     detecta a ausência das colunas para não quebrar a inclusão).
--
-- Formato de "nutrition":
--   { "basis": "100 g" | "100 ml",
--     "per100": { kcal, carbs, protein, fat, sat_fat, trans_fat, fiber,
--                 sugar, added_sugar, sodium },
--     "source_name": text, "source_url": text }

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS nutrition jsonb;

COMMENT ON COLUMN public.shopping_list_items.barcode IS
  'Código de barras confirmado na fonte (Open Food Facts). NULL quando desconhecido.';
COMMENT ON COLUMN public.shopping_list_items.nutrition IS
  'Valores por 100 g/ml + fonte confirmada. NULL quando a inclusão não veio da análise nutricional.';

-- Nenhum GRANT/POLICY novo: as permissões e o RLS por usuário já existentes
-- cobrem as colunas adicionadas à mesma tabela.

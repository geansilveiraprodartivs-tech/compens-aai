
-- helpers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text,
  location_label text,
  cep text,
  city text,
  neighborhood text,
  lat double precision,
  lng double precision,
  radius_km numeric NOT NULL DEFAULT 5,
  budget numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATALOG
CREATE TABLE public.price_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'official_site',
  base_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  chain text,
  website text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores ON DELETE CASCADE,
  label text,
  address text,
  neighborhood text,
  city text,
  state text,
  cep text,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES public.brands ON DELETE SET NULL,
  category text,
  package_qty numeric,
  unit text,
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products ON DELETE CASCADE,
  store_location_id uuid NOT NULL REFERENCES public.store_locations ON DELETE CASCADE,
  price numeric NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'un',
  source_id uuid REFERENCES public.price_sources ON DELETE SET NULL,
  source_url text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  is_promotion boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_prices_product ON public.product_prices(product_id);
CREATE INDEX idx_prices_location ON public.product_prices(store_location_id);

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products ON DELETE CASCADE,
  store_location_id uuid NOT NULL REFERENCES public.store_locations ON DELETE CASCADE,
  title text NOT NULL,
  promo_price numeric,
  regular_price numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  source_id uuid REFERENCES public.price_sources ON DELETE SET NULL,
  source_url text,
  collected_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.price_sources, public.stores, public.store_locations, public.brands, public.products, public.product_prices, public.promotions TO authenticated;
GRANT ALL ON public.price_sources, public.stores, public.store_locations, public.brands, public.products, public.product_prices, public.promotions TO service_role;
ALTER TABLE public.price_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog read" ON public.price_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read" ON public.stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read" ON public.store_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read" ON public.product_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read" ON public.promotions FOR SELECT TO authenticated USING (true);

-- USER DATA
CREATE TABLE public.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Minha lista',
  budget numeric,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shopping_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.shopping_lists ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id uuid REFERENCES public.products ON DELETE SET NULL,
  name text NOT NULL,
  brand text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'un',
  price numeric NOT NULL DEFAULT 0,
  reference_price numeric,
  checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shopping_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  list_id uuid REFERENCES public.shopping_lists ON DELETE SET NULL,
  store_location_id uuid REFERENCES public.store_locations ON DELETE SET NULL,
  store_name text,
  budget numeric,
  total_spent numeric NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  promotions_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE public.savings_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id uuid REFERENCES public.shopping_sessions ON DELETE CASCADE,
  real_savings numeric NOT NULL DEFAULT 0,
  potential_savings numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists, public.shopping_list_items, public.shopping_sessions, public.savings_records TO authenticated;
GRANT ALL ON public.shopping_lists, public.shopping_list_items, public.shopping_sessions, public.savings_records TO service_role;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.shopping_lists FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows" ON public.shopping_list_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows" ON public.shopping_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows" ON public.savings_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_lists_updated BEFORE UPDATE ON public.shopping_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

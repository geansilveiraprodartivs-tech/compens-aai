ALTER TABLE public.stores ADD CONSTRAINT stores_name_key UNIQUE (name);
ALTER TABLE public.price_sources ADD CONSTRAINT price_sources_name_key UNIQUE (name);
CREATE UNIQUE INDEX store_locations_store_city_idx ON public.store_locations (store_id, lower(coalesce(city, '')));
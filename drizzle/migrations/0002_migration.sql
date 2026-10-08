CREATE TABLE public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method text not null default 'pix',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_payments TO authenticated;
GRANT ALL ON public.purchase_payments TO service_role;
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.purchase_payments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
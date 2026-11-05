CREATE TABLE public.mobile_trial_claims (phone_hash text PRIMARY KEY, user_id uuid NOT NULL UNIQUE, trial_started_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.mobile_trial_claims TO service_role;
ALTER TABLE public.mobile_trial_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages mobile trial claims" ON public.mobile_trial_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.mobile_verifications (user_id uuid PRIMARY KEY, phone_hash text NOT NULL, verification_sid text NOT NULL, expires_at timestamptz NOT NULL, verified_at timestamptz);
GRANT ALL ON public.mobile_verifications TO service_role;
ALTER TABLE public.mobile_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages mobile verifications" ON public.mobile_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE FUNCTION public.claim_mobile_trial(p_user_id uuid, p_phone_hash text, p_legacy_start timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed public.mobile_trial_claims; pending public.mobile_verifications;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_hash, 0));
 SELECT * INTO pending FROM public.mobile_verifications WHERE user_id = p_user_id FOR UPDATE;
 IF pending.phone_hash IS DISTINCT FROM p_phone_hash OR pending.verified_at IS NULL THEN RAISE EXCEPTION 'mobile_verification_required'; END IF;
 SELECT * INTO claimed FROM public.mobile_trial_claims WHERE user_id = p_user_id;
 IF FOUND THEN RETURN jsonb_build_object('eligible', true, 'trial_started_at', claimed.trial_started_at); END IF;
 INSERT INTO public.mobile_trial_claims(phone_hash,user_id,trial_started_at) VALUES(p_phone_hash,p_user_id,LEAST(COALESCE(p_legacy_start,now()),now())) ON CONFLICT(phone_hash) DO NOTHING;
 SELECT * INTO claimed FROM public.mobile_trial_claims WHERE phone_hash = p_phone_hash;
 RETURN jsonb_build_object('eligible', claimed.user_id = p_user_id, 'trial_started_at', CASE WHEN claimed.user_id = p_user_id THEN claimed.trial_started_at ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_mobile_trial(uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mobile_trial(uuid,text,timestamptz) TO service_role;
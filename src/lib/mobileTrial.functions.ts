import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const sendMobileCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: z.string().min(10).max(25) }).parse(input))
  .handler(async ({ data, context }) => {
    const { startMobileVerification } = await import('./mobileTrial.server');
    return startMobileVerification(context.userId, data.phone);
  });

export const checkMobileCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { confirmMobileVerification } = await import('./mobileTrial.server');
    return confirmMobileVerification(context.userId, data.code);
  });
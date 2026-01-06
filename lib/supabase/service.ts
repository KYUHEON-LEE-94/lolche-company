import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const supabaseService = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // ❗ 절대 클라이언트에 노출 금지
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    }
)

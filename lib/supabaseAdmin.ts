import { createClient } from '@supabase/supabase-js'

// supabaseAdmin은 수작업 Database 타입(types/supabase.ts)이 Supabase v2.81 제네릭 요구사항과
// 호환되지 않아 비제네릭으로 유지. 타입 안전성이 필요한 서버 코드는 supabaseService를 사용.
// 근본 해결: npx supabase gen types typescript 로 자동 생성 타입 교체.
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      db: { schema: 'public' },
    }
)
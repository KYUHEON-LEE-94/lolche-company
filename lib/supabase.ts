import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ✅ 일반 클라이언트 (주로 Storage 등 백엔드 용도)
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// ✅ 브라우저용 클라이언트 (클라이언트 컴포넌트에서 사용, 로그인/세션 관리용)
export const supabaseClient = createBrowserClient<Database>(supabaseUrl, supabaseKey);
import 'server-only'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function claimDailyLogin(memberId:string) { return claim('claim_daily_login_points',{ p_member_id:memberId }) }
async function claim(name:string,args:Record<string,string>) {
  const { data, error } = await supabaseAdmin.rpc(name,args)
  if (!error) { const row=Array.isArray(data)?data[0]:data; return Boolean(row && typeof row==='object' && 'awarded' in row && row.awarded===true) }
  if (isMissingFunctionError(error) || isMissingTableError(error)) return false
  console.error(`[points] ${name} 실패`,error.message)
  return false
}

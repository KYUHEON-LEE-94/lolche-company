import 'server-only'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function claimDailyLogin(memberId:string) { return claim('claim_daily_login_points',{ p_member_id:memberId }) }
export async function claimGameParticipation(gameId:string,memberId:string) { return claim('claim_custom_game_participation_points',{ p_game_id:gameId,p_member_id:memberId }) }
async function claim(name:string,args:Record<string,string>) {
  const { error } = await supabaseAdmin.rpc(name,args)
  if (!error) return
  if (isMissingFunctionError(error) || isMissingTableError(error)) return
  console.error(`[points] ${name} 실패`,error.message)
}

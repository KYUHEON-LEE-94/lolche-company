import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { requireAdmin } from '@/app/lib/isAdmin'
import { isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic='force-dynamic'
const H={ 'Cache-Control':'private, no-store' }
export async function GET(){
 const mine=await getMyMember(); if(!mine.ok)return NextResponse.json({error:mine.message},{status:mine.status,headers:H})
 if(!mine.member||mine.member.status!=='approved')return NextResponse.json({error:'승인된 멤버만 사용할 수 있습니다.'},{status:403,headers:H})
 const admin=(await requireAdmin()).ok
 const [account,frames,effects,themes,fi,ei,ti,ledger,member]=await Promise.all([
  supabaseAdmin.from('point_accounts').select('balance').eq('member_id',mine.member.id).maybeSingle(),
  supabaseAdmin.from('profile_frames').select('id,key,label,image_path,price_points,is_purchasable,sort_order').eq('is_active',true).order('sort_order'),
  supabaseAdmin.from('ranking_card_effects').select('id,key,label,description,effect_key,image_path,price_points,is_purchasable,sort_order').eq('is_active',true).order('sort_order'),
  supabaseAdmin.from('profile_card_themes').select('id,key,label,description,price_points,is_purchasable,sort_order').eq('is_active',true).order('sort_order'),
  supabaseAdmin.from('member_frame_inventory').select('frame_id').eq('member_id',mine.member.id),
  supabaseAdmin.from('member_rank_effect_inventory').select('effect_id').eq('member_id',mine.member.id),
  supabaseAdmin.from('member_profile_theme_inventory').select('theme_id').eq('member_id',mine.member.id),
  supabaseAdmin.from('point_ledger').select('id,amount,reason,description,balance_after,created_at').eq('member_id',mine.member.id).order('created_at',{ascending:false}).limit(10),
  supabaseAdmin.from('members').select('profile_frame_path,ranking_card_effect_key,ranking_card_bg_image,profile_card_theme_key').eq('id',mine.member.id).single(),
 ])
 const error=account.error??frames.error??effects.error??themes.error??fi.error??ei.error??ti.error??ledger.error??member.error
 if(error){
  if(isMissingTableError(error)||isMissingColumnError(error)){ const legacy=await supabaseAdmin.from('profile_frames').select('id,key,label,image_path,sort_order').eq('is_active',true).order('sort_order'); return NextResponse.json({migration_required:true,balance:0,isAdmin:admin,frames:(legacy.data??[]).map((f)=>({...f,price_points:0,is_purchasable:true,owned:true,equipped:false})),effects:[],themes:[],ledger:[]},{headers:H}) }
  return NextResponse.json({error:'상점 정보를 불러오지 못했습니다.'},{status:500,headers:H})
 }
 const ownedFrames=new Set((fi.data??[]).map((r)=>r.frame_id)); const ownedEffects=new Set((ei.data??[]).map((r)=>r.effect_id)); const ownedThemes=new Set((ti.data??[]).map((r)=>r.theme_id))
 return NextResponse.json({migration_required:false,balance:account.data?.balance??0,isAdmin:admin,viewer:await loadPreviewViewer(mine.member.id,mine.member.member_name),frames:(frames.data??[]).map((f)=>({...f,owned:admin||f.price_points===0||ownedFrames.has(f.id),equipped:member.data?.profile_frame_path===f.image_path})),effects:(effects.data??[]).map((e)=>({...e,owned:admin||ownedEffects.has(e.id),equipped:e.image_path?member.data?.ranking_card_bg_image===e.image_path:member.data?.ranking_card_effect_key===e.effect_key})),themes:(themes.data??[]).map((t)=>({...t,owned:admin||t.price_points===0||ownedThemes.has(t.id),equipped:member.data?.profile_card_theme_key===t.key})),ledger:ledger.data??[]},{headers:H})
}

/**
 * 상점 미리보기용 내 프로필(아바타·랭크). 순수 표시용이라 실패해도 상점을 막지 않는다.
 *
 * ★ 위 Promise.all 에 넣지 않는다. 그 배열은 에러 하나가 통합 판정(21행)에 걸려
 *   상점 전체를 legacy/500 으로 떨어뜨리므로, discord_avatar_url 미적용(42703) 같은
 *   사소한 사유로 상점이 통째로 퇴행한다. 여기서는 실패를 삼키고 미리보기만 포기한다.
 */
async function loadPreviewViewer(memberId:string,memberName:string){
 const fallback={name:memberName,avatarUrl:null,tier:null,rank:null,lp:null}
 try{
  const {data,error}=await supabaseAdmin.from('members').select('discord_avatar_url,tft_tier,tft_rank,tft_league_points').eq('id',memberId).single()
  if(error||!data)return fallback
  return {name:memberName,avatarUrl:data.discord_avatar_url??null,tier:data.tft_tier??null,rank:data.tft_rank??null,lp:data.tft_league_points??null}
 }catch{return fallback}
}

import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { UUID_RE,isRecord } from '@/lib/calendar/events'
import { isMissingFunctionError,isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic='force-dynamic'
export async function POST(req:Request){
 const mine=await getMyMember(); if(!mine.ok)return NextResponse.json({error:mine.message},{status:mine.status}); if(!mine.member||mine.member.status!=='approved')return NextResponse.json({error:'승인된 멤버만 사용할 수 있습니다.'},{status:403})
 let body:unknown; try{body=await req.json()}catch(e){return NextResponse.json({error:e instanceof Error?'요청 형식이 올바르지 않습니다.':'오류 발생'},{status:400})}
 if(!isRecord(body)||Object.keys(body).some(k=>!['itemType','itemId'].includes(k))||(body.itemType!=='frame'&&body.itemType!=='rank_effect'&&body.itemType!=='profile_theme')||typeof body.itemId!=='string'||!UUID_RE.test(body.itemId))return NextResponse.json({error:'상품 정보가 올바르지 않습니다.'},{status:400})
 const rpc=body.itemType==='frame'?'purchase_profile_frame':body.itemType==='rank_effect'?'purchase_rank_effect':'purchase_profile_card_theme'; const args=body.itemType==='frame'?{p_member_id:mine.member.id,p_frame_id:body.itemId}:body.itemType==='rank_effect'?{p_member_id:mine.member.id,p_effect_id:body.itemId}:{p_member_id:mine.member.id,p_theme_id:body.itemId}
 const {data,error}=await supabaseAdmin.rpc(rpc,args); if(error){if(isMissingFunctionError(error)||isMissingTableError(error))return NextResponse.json({error:'포인트 상점 준비 중입니다.',migration_required:true},{status:503}); return NextResponse.json({error:'구매하지 못했습니다.'},{status:500})}
 const row=Array.isArray(data)?data[0]:data; const status=row&&typeof row==='object'&&'status'in row?String(row.status):'unknown'; if(status==='insufficient')return NextResponse.json({error:'포인트가 부족합니다.'},{status:409}); if(status==='not_found')return NextResponse.json({error:'구매할 수 없는 상품입니다.'},{status:404}); return NextResponse.json({ok:true,status,balance:row&&typeof row==='object'&&'balance'in row?row.balance:null})
}

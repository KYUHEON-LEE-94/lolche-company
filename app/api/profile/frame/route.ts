import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getMyMember } from '@/lib/members/myMember'
import { requireAdmin } from '@/app/lib/isAdmin'
import { isRecord } from '@/lib/calendar/events'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingColumnError } from '@/lib/db/pgErrors'
export const dynamic='force-dynamic'
export async function POST(req:Request){
 const mine=await getMyMember(); if(!mine.ok)return NextResponse.json({ok:false,message:mine.message},{status:mine.status}); if(!mine.member||mine.member.status!=='approved')return NextResponse.json({ok:false,message:'승인된 멤버만 사용할 수 있습니다.'},{status:403})
 let body:unknown; try{body=await req.json()}catch(e){return NextResponse.json({ok:false,message:e instanceof Error?'요청 형식이 올바르지 않습니다.':'오류 발생'},{status:400})}
 if(!isRecord(body)||Object.keys(body).some(k=>k!=='framePath')||(body.framePath!==null&&typeof body.framePath!=='string'))return NextResponse.json({ok:false,message:'Invalid framePath'},{status:400})
 if(body.framePath===null){await supabaseAdmin.from('members').update({profile_frame_path:null}).eq('id',mine.member.id); invalidate();return NextResponse.json({ok:true})}
 const full=await supabaseAdmin.from('profile_frames').select('id,image_path,price_points').eq('image_path',body.framePath).eq('is_active',true).maybeSingle()
 let frame=full.data as unknown as {id:string;image_path:string;price_points:number}|null
 if(full.error&&isMissingColumnError(full.error)){const legacy=await supabaseAdmin.from('profile_frames').select('id,image_path').eq('image_path',body.framePath).eq('is_active',true).maybeSingle();if(legacy.error)return NextResponse.json({ok:false,message:'프레임 조회에 실패했습니다.'},{status:500});frame=legacy.data?{...(legacy.data as unknown as {id:string;image_path:string}),price_points:0}:null}else if(full.error)return NextResponse.json({ok:false,message:'프레임 조회에 실패했습니다.'},{status:500})
 if(!frame)return NextResponse.json({ok:false,message:'Invalid framePath'},{status:400})
 const admin=(await requireAdmin()).ok
 if(!admin&&frame.price_points>0){const {data:owned}=await supabaseAdmin.from('member_frame_inventory').select('frame_id').eq('member_id',mine.member.id).eq('frame_id',frame.id).maybeSingle();if(!owned)return NextResponse.json({ok:false,message:'구매한 프레임만 장착할 수 있습니다.'},{status:403})}
 const {error}=await supabaseAdmin.from('members').update({profile_frame_path:frame.image_path}).eq('id',mine.member.id);if(error)return NextResponse.json({ok:false,message:'프레임 저장에 실패했습니다.'},{status:500});invalidate();return NextResponse.json({ok:true})
}
function invalidate(){revalidatePath('/');revalidatePath('/profile');revalidatePath('/tft');revalidatePath('/lol')}

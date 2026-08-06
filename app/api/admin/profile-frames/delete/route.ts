import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { UUID_RE } from '@/lib/calendar/events'

export async function POST(req: Request) {
    const { ok, supabase } = await requireAdmin()
    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const body: unknown = await req.json().catch(() => null)
    const id = body && typeof body === 'object' && 'id' in body ? (body as {id?:unknown}).id : null
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return NextResponse.json({ ok: false, message: '유효한 id가 필요합니다.' }, { status: 400 })
    }
    const {data:frame,error:frameError}=await supabaseAdmin.from('profile_frames').select('image_path').eq('id',id).maybeSingle()
    if(frameError)return NextResponse.json({ok:false,message:'프레임 조회에 실패했습니다.'},{status:500})
    if(!frame)return NextResponse.json({ok:false,message:'프레임을 찾을 수 없습니다.'},{status:404})
    const [ownedResult,equippedResult]=await Promise.all([supabaseAdmin.from('member_frame_inventory').select('member_id',{count:'exact',head:true}).eq('frame_id',id),supabaseAdmin.from('members').select('id',{count:'exact',head:true}).eq('profile_frame_path',frame.image_path)])
    if(ownedResult.error||equippedResult.error)return NextResponse.json({ok:false,message:'프레임 사용 여부를 확인하지 못했습니다.'},{status:500})
    if((ownedResult.count??0)>0||(equippedResult.count??0)>0){
        const {error:deactivateError}=await supabaseAdmin.from('profile_frames').update({is_active:false,is_purchasable:false}).eq('id',id)
        if(deactivateError)return NextResponse.json({ok:false,message:'프레임 비활성화에 실패했습니다.'},{status:500})
        revalidatePath('/profile');revalidatePath('/tft');return NextResponse.json({ok:true,deactivated:true})
    }
    const { error: delErr } = await supabaseAdmin.from('profile_frames').delete().eq('id', id)
    if (delErr) return NextResponse.json({ ok: false, message: delErr.message }, { status: 400 })

    // 2) Storage 삭제
    const { error: rmErr } = frame.image_path.startsWith('/')?{error:null}:await supabase.storage.from('profile-frames').remove([frame.image_path])
    if (rmErr) return NextResponse.json({ ok: false, message: rmErr.message }, { status: 400 })

    // ✅ 3) 캐시 무효화 (프레임 목록/프로필/랭킹 반영)
    revalidatePath('/profile')
    revalidatePath('/admin/profile-frames')
    revalidatePath('/tft')

    return NextResponse.json({ ok: true })
}

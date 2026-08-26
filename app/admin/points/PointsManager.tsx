'use client'

import { useCallback, useEffect, useState } from 'react'

type Member = { id:string; name:string; balance:number }
type Ledger = { id:number; member_name:string; amount:number; reason:string; description:string|null; balance_after:number; created_at:string; actor_name:string }

const REASON_LABEL: Record<string,string> = {
  daily_login: '출석',
  custom_game_participation: '내전 참여',
  cosmetic_purchase: '꾸미기 구매',
  shop_purchase: '상점 구매',
  admin_adjustment: '관리자',
  hall_of_fame: '명예의 전당',
}
const REASON_STYLE: Record<string,string> = {
  daily_login: 'bg-sky-500/10 text-sky-600',
  custom_game_participation: 'bg-indigo-500/10 text-brand-ink',
  cosmetic_purchase: 'bg-rose-500/10 text-rose-600',
  shop_purchase: 'bg-rose-500/10 text-rose-600',
  admin_adjustment: 'bg-slate-500/10 text-slate-500',
  hall_of_fame: 'bg-amber-500/10 text-warn-ink',
}
const REASON_OPTIONS: [string,string][] = [['','전체 유형'],...Object.entries(REASON_LABEL)]

export default function PointsManager() {
  const [members,setMembers]=useState<Member[]>([]); const [ledger,setLedger]=useState<Ledger[]>([])
  const [q,setQ]=useState(''); const [memberId,setMemberId]=useState(''); const [amount,setAmount]=useState(''); const [description,setDescription]=useState(''); const [requestId,setRequestId]=useState('')
  const [sign,setSign]=useState<1|-1>(1)
  const [reasonFilter,setReasonFilter]=useState('')
  const [message,setMessage]=useState(''); const [loading,setLoading]=useState(false)
  const load=useCallback(async()=>{ const res=await fetch(`/api/admin/points?q=${encodeURIComponent(q)}${reasonFilter?`&reason=${reasonFilter}`:''}`,{cache:'no-store'}); const data:unknown=await res.json(); if(res.ok && data && typeof data==='object' && 'members' in data && 'ledger' in data){ const value=data as {members:Member[];ledger:Ledger[]}; setMembers(value.members);setLedger(value.ledger) } else setMessage('포인트 정보를 불러오지 못했습니다.') },[q,reasonFilter])
  useEffect(()=>{ const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[load])
  async function grant(){
    if(!memberId)return
    setLoading(true);setMessage('')
    const id=requestId||crypto.randomUUID();setRequestId(id)
    try {
      const res=await fetch('/api/admin/points',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId,amount:sign*Number(amount),requestId:id,description})})
      const data:unknown=await res.json()
      if(!res.ok){setMessage(data&&typeof data==='object'&&'error'in data?String(data.error):sign>0?'지급하지 못했습니다.':'차감하지 못했습니다.');return}
      setMessage(sign>0?'포인트를 지급했습니다.':'포인트를 차감했습니다.');setAmount('');setDescription('');setRequestId('');await load()
    } catch {
      setMessage('네트워크 오류가 발생했습니다. 같은 요청으로 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }
  return <section className="space-y-6">
    <div><h1 className="text-2xl font-black text-fg">포인트 관리</h1><p className="mt-1 text-sm text-muted">승인 멤버에게 운영 포인트를 지급하거나 차감합니다.</p></div>
    <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-2">
      <div className="inline-flex rounded-xl border border-line bg-canvas p-1 md:col-span-2">
        <button type="button" onClick={()=>{setSign(1);setRequestId('')}} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${sign>0?'bg-brand text-white':'text-muted hover:text-fg'}`}>지급 (+)</button>
        <button type="button" onClick={()=>{setSign(-1);setRequestId('')}} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${sign<0?'bg-danger text-white':'text-muted hover:text-fg'}`}>차감 (−)</button>
      </div>
      <input className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" placeholder="멤버 검색" value={q} onChange={e=>setQ(e.target.value)} />
      <select className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" value={memberId} onChange={e=>{setMemberId(e.target.value);setRequestId('')}}><option value="">멤버 선택</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.balance.toLocaleString()}P</option>)}</select>
      <input className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" type="number" min={1} max={10000} placeholder="포인트 (1~10,000)" value={amount} onChange={e=>{setAmount(e.target.value);setRequestId('')}} />
      <input className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" maxLength={200} placeholder={sign>0?'지급 사유':'차감 사유'} value={description} onChange={e=>{setDescription(e.target.value);setRequestId('')}} />
      <button className={`rounded-xl px-4 py-2 font-bold text-white disabled:opacity-50 md:col-span-2 ${sign>0?'bg-brand':'bg-danger'}`} disabled={loading||!memberId||!amount||Number(amount)<1||!description.trim()} onClick={()=>void grant()}>{loading?(sign>0?'지급 중…':'차감 중…'):(sign>0?'포인트 지급':'포인트 차감')}</button>
      {message&&<p className="text-sm text-muted md:col-span-2">{message}</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-black text-fg">포인트 내역 <span className="text-xs font-bold text-muted">지급·차감 전체 로그</span></h2>
      <select className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg" value={reasonFilter} onChange={e=>setReasonFilter(e.target.value)}>{REASON_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-line"><table className="min-w-[720px] w-full text-sm"><thead className="bg-surface-2 text-muted"><tr><th className="p-3 text-left">멤버</th><th className="p-3 text-left">유형</th><th className="p-3 text-right">증감</th><th className="p-3 text-left">사유</th><th className="p-3 text-right">잔액</th><th className="p-3 text-left">처리</th><th className="p-3 text-left">일시</th></tr></thead><tbody>{ledger.length===0?<tr><td colSpan={7} className="p-6 text-center text-muted">내역이 없습니다.</td></tr>:ledger.map(row=><tr key={row.id} className="border-t border-line"><td className="p-3 font-bold text-fg">{row.member_name}</td><td className="p-3"><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${REASON_STYLE[row.reason]??'bg-surface-2 text-muted'}`}>{REASON_LABEL[row.reason]??row.reason}</span></td><td className={`p-3 text-right font-bold ${row.amount>0?'text-brand-ink':'text-danger-ink'}`}>{row.amount>0?'+':''}{row.amount.toLocaleString()}P</td><td className="p-3 text-muted">{row.description}</td><td className="p-3 text-right text-fg">{row.balance_after.toLocaleString()}P</td><td className="p-3 text-muted">{row.actor_name}</td><td className="p-3 text-muted">{new Date(row.created_at).toLocaleString('ko-KR')}</td></tr>)}</tbody></table></div>
  </section>
}

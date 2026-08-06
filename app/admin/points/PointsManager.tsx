'use client'

import { useCallback, useEffect, useState } from 'react'

type Member = { id:string; name:string; balance:number }
type Ledger = { id:number; member_name:string; amount:number; description:string|null; balance_after:number; created_at:string; actor_name:string }

export default function PointsManager() {
  const [members,setMembers]=useState<Member[]>([]); const [ledger,setLedger]=useState<Ledger[]>([])
  const [q,setQ]=useState(''); const [memberId,setMemberId]=useState(''); const [amount,setAmount]=useState(''); const [description,setDescription]=useState(''); const [requestId,setRequestId]=useState('')
  const [message,setMessage]=useState(''); const [loading,setLoading]=useState(false)
  const load=useCallback(async()=>{ const res=await fetch(`/api/admin/points?q=${encodeURIComponent(q)}`,{cache:'no-store'}); const data:unknown=await res.json(); if(res.ok && data && typeof data==='object' && 'members' in data && 'ledger' in data){ const value=data as {members:Member[];ledger:Ledger[]}; setMembers(value.members);setLedger(value.ledger) } else setMessage('포인트 정보를 불러오지 못했습니다.') },[q])
  useEffect(()=>{ const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[load])
  async function grant(){
    if(!memberId)return
    setLoading(true);setMessage('')
    const id=requestId||crypto.randomUUID();setRequestId(id)
    try {
      const res=await fetch('/api/admin/points',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId,amount:Number(amount),requestId:id,description})})
      const data:unknown=await res.json()
      if(!res.ok){setMessage(data&&typeof data==='object'&&'error'in data?String(data.error):'지급하지 못했습니다.');return}
      setMessage('포인트를 지급했습니다.');setAmount('');setDescription('');setRequestId('');await load()
    } catch {
      setMessage('네트워크 오류가 발생했습니다. 같은 요청으로 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }
  return <section className="space-y-6">
    <div><h1 className="text-2xl font-black text-fg">포인트 관리</h1><p className="mt-1 text-sm text-muted">승인 멤버에게 운영 포인트를 안전하게 지급합니다.</p></div>
    <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-2">
      <input className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" placeholder="멤버 검색" value={q} onChange={e=>setQ(e.target.value)} />
      <select className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" value={memberId} onChange={e=>{setMemberId(e.target.value);setRequestId('')}}><option value="">지급할 멤버 선택</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.balance.toLocaleString()}P</option>)}</select>
      <input className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" type="number" min={1} max={10000} placeholder="지급 포인트 (1~10,000)" value={amount} onChange={e=>{setAmount(e.target.value);setRequestId('')}} />
      <input className="rounded-xl border border-line bg-canvas px-3 py-2 text-fg" maxLength={200} placeholder="지급 사유" value={description} onChange={e=>{setDescription(e.target.value);setRequestId('')}} />
      <button className="rounded-xl bg-brand px-4 py-2 font-bold text-white disabled:opacity-50 md:col-span-2" disabled={loading||!memberId||!amount||!description.trim()} onClick={()=>void grant()}>{loading?'지급 중…':'포인트 지급'}</button>
      {message&&<p className="text-sm text-muted md:col-span-2">{message}</p>}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-line"><table className="min-w-[640px] w-full text-sm"><thead className="bg-surface-2 text-muted"><tr><th className="p-3 text-left">멤버</th><th className="p-3 text-right">지급</th><th className="p-3 text-left">사유</th><th className="p-3 text-right">잔액</th><th className="p-3 text-left">관리자</th><th className="p-3 text-left">일시</th></tr></thead><tbody>{ledger.map(row=><tr key={row.id} className="border-t border-line"><td className="p-3 font-bold text-fg">{row.member_name}</td><td className="p-3 text-right text-brand-ink">+{row.amount.toLocaleString()}P</td><td className="p-3 text-muted">{row.description}</td><td className="p-3 text-right text-fg">{row.balance_after.toLocaleString()}P</td><td className="p-3 text-muted">{row.actor_name}</td><td className="p-3 text-muted">{new Date(row.created_at).toLocaleString('ko-KR')}</td></tr>)}</tbody></table></div>
  </section>
}

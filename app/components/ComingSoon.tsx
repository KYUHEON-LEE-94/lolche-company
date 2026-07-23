type Props = {
  title: string
  description: string
}

export default function ComingSoon({ title, description }: Props) {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#07090f] px-4 py-20">
      <div className="max-w-2xl mx-auto text-center">
        <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black tracking-[0.3em] uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
          Coming Soon
        </span>
        <h1 className="mt-6 text-3xl sm:text-4xl font-black text-white">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{description}</p>
      </div>
    </main>
  )
}

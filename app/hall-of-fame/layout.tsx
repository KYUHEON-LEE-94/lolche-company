// src/app/hall-of-fame/layout.tsx
export default function HallOfFameLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-slate-100 selection:bg-amber-500/30">
            {/* 장식용 배경 요소 */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
                <div className="absolute top-[20%] -right-[10%] w-[30%] h-[50%] bg-amber-900/10 blur-[120px] rounded-full" />
            </div>
            <div className="relative z-10">{children}</div>
        </div>
    );
}
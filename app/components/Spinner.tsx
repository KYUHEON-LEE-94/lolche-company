export function Spinner({ size = 4 }: { size?: number | string }) {
    // Tailwind의 동적 클래스 할당 문제를 방지하기 위해 스타일로 직접 제어하거나
    // 호출부에서 정확한 값을 사용합니다.
    const pixelSize = typeof size === 'number' ? size * 4 : 16;

    return (
        <svg
            className="animate-spin text-current"
            style={{ width: pixelSize, height: pixelSize }}
            viewBox="0 0 24 24"
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`brand-symbol ${className}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        className="brand-boundary"
        d="M17 5H5v12M31 43h12V31"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="brand-letter"
        d="M13 34V15l11 12 11-12v19"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path className="brand-point" d="M35 5h8v8h-8z" fill="currentColor" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand-lockup">
      <BrandMark />
      <span className="brand-word">
        mandate<span className="brand-period">.</span>
      </span>
      <span className="lite-label">LITE</span>
    </span>
  );
}

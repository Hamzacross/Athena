interface Props {
  size?: number;
  className?: string;
}

export function AthenaMark({ size = 48, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={className}
      aria-label="Athena"
      role="img"
    >
      <defs>
        <linearGradient id="am-grad" x1="18" y1="12" x2="110" y2="118" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4f1ff" />
          <stop offset="0.34" stopColor="#4ee6a8" />
          <stop offset="0.68" stopColor="#9b7bff" />
          <stop offset="1" stopColor="#5320b0" />
        </linearGradient>
        <radialGradient id="am-bg" cx="0.32" cy="0.2" r="0.95">
          <stop stopColor="#4ee6a8" stopOpacity="0.36" />
          <stop offset="0.45" stopColor="#7c4dff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#07040d" stopOpacity="0.98" />
        </radialGradient>
        <filter id="am-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#4ee6a8" floodOpacity="0.22" />
        </filter>
      </defs>

      <rect x="8" y="8" width="112" height="112" rx="31" fill="url(#am-bg)" filter="url(#am-shadow)" />
      <path d="M64 24c18 0 34 11 40 28-14-5-29-4-40 5-11-9-26-10-40-5 6-17 22-28 40-28Z" fill="rgba(244,241,255,0.08)" stroke="url(#am-grad)" strokeWidth="3" />
      <path d="M35 93 61 31c1.2-2.8 4.8-2.8 6 0l26 62" stroke="url(#am-grad)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M48 70h32" stroke="url(#am-grad)" strokeWidth="8" strokeLinecap="round" />
      <circle cx="37" cy="53" r="5" fill="#4ee6a8" />
      <circle cx="91" cy="53" r="5" fill="#b39dff" />
      <circle cx="64" cy="95" r="5" fill="#f4f1ff" />
      <path d="M37 53c16-15 38-15 54 0M37 53c6 22 19 35 27 42M91 53c-6 22-19 35-27 42" stroke="rgba(244,241,255,0.34)" strokeWidth="2" fill="none" />
      <path d="M21 88c13 20 74 20 86 0" stroke="rgba(78,230,168,0.32)" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

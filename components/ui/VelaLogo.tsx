interface Props {
  size?: number;
  className?: string;
}

export default function VelaLogo({ size = 40, className = "" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="Vela.ai"
    >
      <defs>
        <linearGradient id="velaLogoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#7b61ff" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="40" height="40" rx="9" fill="url(#velaLogoGrad)" />

      {/* Chart area fill — ascending glow below the line */}
      <path
        d="M5 30 L5 27 L12 22 L20 24.5 L28 16 L28 30 Z"
        fill="white"
        fillOpacity="0.18"
      />

      {/* Chart line — ascending trend */}
      <polyline
        points="5,27 12,22 20,24.5 28,16"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data point dots */}
      <circle cx="12" cy="22" r="1.3" fill="white" fillOpacity="0.7" />
      <circle cx="20" cy="24.5" r="1.3" fill="white" fillOpacity="0.7" />
      {/* Peak dot — chart meets the mast */}
      <circle cx="28" cy="16" r="1.8" fill="white" />

      {/* Mast — rises from the chart peak */}
      <line
        x1="28" y1="16"
        x2="28" y2="6"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Main sail — large left-facing triangle */}
      <path d="M28 7 L28 15.5 L16.5 15.5 Z" fill="white" fillOpacity="0.95" />

      {/* Jib — smaller right-facing triangle */}
      <path d="M28 9.5 L28 15 L36 12.5 Z" fill="white" fillOpacity="0.6" />
    </svg>
  );
}

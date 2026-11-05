// Shared SVG fragments for the HydraTap icon set (1024 × 1024 canvas).
// A minimal, semi-filled water bottle in soothing blue / cyan. No text.

export const BODY =
  'M440 250 L584 250 L584 292 C584 340 724 362 724 452 L724 800 Q724 880 644 880 L380 880 Q300 880 300 800 L300 452 C300 362 440 340 440 292 Z';

const WAVE =
  'M260 600 C330 572 392 572 462 600 C532 628 594 628 664 600 C704 584 734 578 764 582 L764 920 L260 920 Z';

export function bottle({ mono = false } = {}) {
  if (mono) {
    return `
      <path d="${BODY}" fill="none" stroke="#fff" stroke-width="34" stroke-linejoin="round"/>
      <clipPath id="c"><path d="${BODY}"/></clipPath>
      <path d="${WAVE}" fill="#fff" clip-path="url(#c)"/>
      <rect x="412" y="148" width="200" height="118" rx="30" fill="#fff"/>`;
  }
  return `
    <defs>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#EAF7FF"/>
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#67E8F9"/>
        <stop offset="0.5" stop-color="#22B8F0"/>
        <stop offset="1" stop-color="#0284C7"/>
      </linearGradient>
      <linearGradient id="waterBack" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#A5F3FC"/>
        <stop offset="1" stop-color="#7DD3FC"/>
      </linearGradient>
      <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#38BDF8"/>
        <stop offset="1" stop-color="#0369A1"/>
      </linearGradient>
      <clipPath id="c"><path d="${BODY}"/></clipPath>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#0369A1" flood-opacity="0.22"/>
      </filter>
    </defs>
    <g filter="url(#soft)">
      <path d="${BODY}" fill="url(#glass)"/>
    </g>
    <g clip-path="url(#c)">
      <path d="M260 584 C320 606 380 610 450 588 C520 566 590 566 660 588 C700 600 735 604 764 600 L764 920 L260 920 Z" fill="url(#waterBack)"/>
      <path d="${WAVE}" fill="url(#water)"/>
      <circle cx="400" cy="760" r="16" fill="#fff" opacity="0.5"/>
      <circle cx="610" cy="700" r="11" fill="#fff" opacity="0.45"/>
    </g>
    <rect x="336" y="470" width="30" height="300" rx="15" fill="#fff" opacity="0.6"/>
    <path d="${BODY}" fill="none" stroke="#A7DDF7" stroke-width="12" stroke-linejoin="round"/>
    <rect x="412" y="148" width="200" height="118" rx="30" fill="url(#cap)"/>
    <rect x="434" y="178" width="156" height="9" rx="4.5" fill="#fff" opacity="0.3"/>
    <rect x="434" y="204" width="156" height="9" rx="4.5" fill="#fff" opacity="0.3"/>
    <rect x="434" y="230" width="156" height="9" rx="4.5" fill="#fff" opacity="0.3"/>
    <rect x="398" y="250" width="228" height="40" rx="20" fill="#0369A1"/>`;
}

export function background() {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#E6FBFF"/>
        <stop offset="0.55" stop-color="#C9EEFF"/>
        <stop offset="1" stop-color="#A5E4FB"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="42%" r="55%">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <rect width="1024" height="1024" fill="url(#glow)"/>`;
}

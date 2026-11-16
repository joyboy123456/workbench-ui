import React from 'react'

/** V2 自带的线性图标（24px 网格、1.75px 描边）。 */
const P: Record<string, string> = {
  provenance: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M5 8v2a3 3 0 003 3h8a3 3 0 003-3V8M12 13v3"/>',
  sparkles: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3zM20 2v4M18 4h4"/>',
  ratio: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h3M7 10v3M17 14h-3M17 14v-3"/>',
  layers: '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>',
  create: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  canvas: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16M3 10h5"/>',
  home: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  model: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
  hist: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  asset: '<path d="M3 7h7l2 2h9v10H3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 10V4.5a1.5 1.5 0 013 0V11M14 10.5V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7-2.5 0-4-1.2-5.5-3.5L3.5 13a1.5 1.5 0 012.5-1.6L8 14"/>',
  cur: '<path d="M5 3l14 7-6 2-2 6z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  fall: '<rect x="4" y="4" width="7" height="10" rx="1.5"/><rect x="13" y="4" width="7" height="6" rx="1.5"/><rect x="4" y="16" width="7" height="4" rx="1.5"/><rect x="13" y="12" width="7" height="8" rx="1.5"/>',
  wand: '<path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20l10-10M12.5 8.5l3 3"/>',
  pose: '<circle cx="12" cy="5" r="2"/><path d="M12 7v6l-3 7M12 13l3 7M7 10l5-1 5 1"/>',
  up: '<path d="M4 14V20h6M20 10V4h-6M4 20l7-7M20 4l-7 7"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5L20 20M8.5 15.5L20 4"/>',
  doc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  star: '<path d="M12 4l2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.6-.8z"/>',
  cover: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 15l4-4 4 4 3-3 5 5"/>',
  layer: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  kbd: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  'fit-selection': '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  minimap: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h7v6M14 4v6h7"/><rect x="7" y="8" width="10" height="8" rx="1"/>',
  categories: '<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="4" width="7" height="6" rx="1"/><rect x="3" y="14" width="7" height="6" rx="1"/><path d="M14 15h7M14 19h5"/>',
  erase: '<path d="M8 20h12M5.5 14.5l7-7a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8z"/><path d="M9 11l5 5"/>',
  quote: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l2 2 3-4"/>',
  type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  tune: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  crop: '<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  paste: '<rect x="7" y="3" width="10" height="4" rx="1"/><path d="M7 5H5v16h14V5h-2M9 12h6M9 16h6"/>',
  front: '<rect x="7" y="7" width="14" height="14" rx="2"/><path d="M7 17H3V3h14v4"/>',
  back: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M17 7h4v14H7v-4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  up2: '<path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 012 2v4h5a2 2 0 012 2.3l-1.2 6A2 2 0 0116.8 20H7"/>',
  dn2: '<path d="M7 13V4H4v9zM7 13l4 7a2 2 0 002-2v-4h5a2 2 0 002-2.3l-1.2-6A2 2 0 0016.8 4H7"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  brand: '<path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z"/>',
  minus: '<path d="M5 12h14"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  'sidebar-close': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15.5 9.5L13 12l2.5 2.5"/>',
  'sidebar-open': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M13 9.5l2.5 2.5-2.5 2.5"/>',
  expand: '<path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M10 14l-6 6M14 10l6-6"/>',
  zap: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  alert: '<path d="m10.3 4.9-7.6 13A2 2 0 0 0 4.4 21h15.2a2 2 0 0 0 1.7-3.1l-7.6-13a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  retry: '<path d="M3 10a9 9 0 1 1 2.5 8M3 4v6h6"/>',
}

export type IconName = keyof typeof P | string

export function Icon({ name, size = 16, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: P[name] ?? P.info }}
    />
  )
}

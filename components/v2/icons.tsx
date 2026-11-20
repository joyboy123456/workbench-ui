import React from 'react'

/** V2 自带的线性图标（24px 网格、1.75px 描边）。 */
const P: Record<string, string> = {
  toolbox: '<path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/>',
  provenance: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M5 8v2a3 3 0 003 3h8a3 3 0 003-3V8M12 13v3"/>',
  sparkles: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3zM20 2v4M18 4h4"/>',
  ratio: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h3M7 10v3M17 14h-3M17 14v-3"/>',
  layers: '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>',
  create: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  canvas: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16M3 10h5"/>',
  home: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  'nav-home': '<path d="M4.5 10.6 11.1 4.8a1.4 1.4 0 0 1 1.8 0l6.6 5.8M6.2 9.4v9.1a1.5 1.5 0 0 0 1.5 1.5h8.6a1.5 1.5 0 0 0 1.5-1.5V9.4"/><path d="M10 20v-4.8a1.2 1.2 0 0 1 1.2-1.2h1.6a1.2 1.2 0 0 1 1.2 1.2V20"/>',
  'nav-tools': '<rect x="3.8" y="3.8" width="6.6" height="6.6" rx="1.8"/><rect x="3.8" y="13.6" width="6.6" height="6.6" rx="1.8"/><rect x="13.6" y="13.6" width="6.6" height="6.6" rx="1.8"/><path d="m16.9 3.2 1.15 2.75 2.75 1.15-2.75 1.15-1.15 2.75-1.15-2.75-2.75-1.15 2.75-1.15z"/>',
  'nav-projects': '<path d="M3.8 7.2A2.2 2.2 0 0 1 6 5h3.4c.6 0 1.16.26 1.54.72l1.02 1.23c.25.3.62.47 1.01.47H18a2.2 2.2 0 0 1 2.2 2.2v7.6A2.2 2.2 0 0 1 18 19.4H6a2.2 2.2 0 0 1-2.2-2.2z"/><path d="M3.8 10.2h16.4"/>',
  'nav-assets': '<rect x="3.8" y="6.2" width="13.2" height="13.2" rx="2.4"/><path d="M8.2 6.2V5A1.8 1.8 0 0 1 10 3.2h8.2A1.8 1.8 0 0 1 20 5v8.2a1.8 1.8 0 0 1-1.8 1.8H17"/><circle cx="8.2" cy="10.6" r="1.35"/><path d="m4.3 16.8 3.5-3.3a1.2 1.2 0 0 1 1.65 0l3.75 3.3"/>',
  login: '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M10 16.5 14.5 12 10 7.5M14.2 12H4"/>',
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
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  paste: '<rect x="7" y="3" width="10" height="4" rx="1"/><path d="M7 5H5v16h14V5h-2M9 12h6M9 16h6"/>',
  front: '<rect x="7" y="7" width="14" height="14" rx="2"/><path d="M7 17H3V3h14v4"/>',
  back: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M17 7h4v14H7v-4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017-2"/>',
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
  edit: '<path d="m16 3 5 5-12 12H4v-5zM14 5l5 5"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="4"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  'sidebar-close': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15.5 9.5L13 12l2.5 2.5"/>',
  'sidebar-open': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M13 9.5l2.5 2.5-2.5 2.5"/>',
  expand: '<path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M10 14l-6 6M14 10l6-6"/>',
  zap: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  alert: '<path d="m10.3 4.9-7.6 13A2 2 0 0 0 4.4 21h15.2a2 2 0 0 0 1.7-3.1l-7.6-13a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  enter: '<path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  askq: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  retry: '<path d="M3 10a9 9 0 1 1 2.5 8M3 4v6h6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  bag: '<path d="M6 7h12l1 13H5z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
  social: '<rect x="3" y="4" width="12" height="10" rx="2"/><path d="M9 14v3l3-3M15 9h4a2 2 0 0 1 2 2v7l-3-2h-6a2 2 0 0 1-2-2v-2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.3 0 2.2-.9 2.2-2.1 0-.6-.2-1.1-.6-1.5-.4-.4-.6-.9-.6-1.5 0-1.2 1-2.1 2.2-2.1H17a4 4 0 0 0 4-4c0-3.9-4-6.8-9-6.8Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  globe: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 14l-2 2 2 2M15 14l2 2-2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  agent: '<circle cx="12" cy="12" r="9"/><circle cx="9.2" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10.8" r="1" fill="currentColor" stroke="none"/><path d="M9.3 14.4c.7.9 1.6 1.3 2.7 1.3s2-.4 2.7-1.3"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  'model-openai': '<path fill="currentColor" stroke="none" d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9 5.98 5.98 0 0 0 4.5 2.01 6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07Zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.5 4.5 0 0 1-4.5 4.49Zm-9.66-4.13a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.75a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.79a4.5 4.5 0 0 1-6.13-1.64ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L4 14a4.5 4.5 0 0 1-1.66-6.1Zm16.6 3.86-5.84-3.37 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.68Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.79.79 0 0 0-.4.68Zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5Z"/>',
  'model-gemini': '<path fill="currentColor" stroke="none" d="M12 2.5c.4 4.8 4.2 8.6 9 9.5-4.8.9-8.6 4.7-9 9.5-.4-4.8-4.2-8.6-9-9.5 4.8-.9 8.6-4.7 9-9.5Z"/>',
  'model-seedream': '<path fill="currentColor" stroke="none" d="M12 3c2.2 0 3.7 1.8 3.7 4 0 .6-.1 1.2-.3 1.7.5-.2 1.1-.3 1.7-.3 2.2 0 4 1.5 4 3.7s-1.8 3.7-4 3.7c-.6 0-1.2-.1-1.7-.3.2.5.3 1.1.3 1.7 0 2.2-1.5 4-3.7 4s-3.7-1.8-3.7-4c0-.6.1-1.2.3-1.7-.5.2-1.1.3-1.7.3-2.2 0-4-1.5-4-3.7s1.8-3.7 4-3.7c.6 0 1.2.1 1.7.3-.2-.5-.3-1.1-.3-1.7 0-2.2 1.5-4 3.7-4Zm0 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>',
  'model-grok': '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 7.5 8.5 16.5"/>',
}

export type IconName = keyof typeof P | string

export function modelIconName(modelId?: string): IconName {
  const id = (modelId ?? '').trim().toLowerCase()
  if (!id) return 'sparkles'
  if (id.includes('gpt-image') || id.startsWith('openai/')) return 'model-openai'
  if (id.includes('nano-banana') || id.includes('gemini')) return 'model-gemini'
  if (id.includes('seedream') || id.includes('doubao') || id.includes('jimeng')) return 'model-seedream'
  if (id.includes('grok')) return 'model-grok'
  return 'sparkles'
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className, style }: { name: IconName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-icon={name}
      dangerouslySetInnerHTML={{ __html: P[name] ?? P.info }}
    />
  )
}

export function BrandMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className ? `v2-brand-mark ${className}` : 'v2-brand-mark'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

'use client'
import { useEffect, useRef } from 'react'

/**
 * 首页标题区背景：点阵 + 少量漂浮微粒，纯装饰（aria-hidden、不接收指针）。
 * - 点阵按距中心的距离淡出，偶尔有点被「点亮」后缓慢熄灭
 * - 微粒带蓝 / 暖橙两种色温，缓慢上浮
 * - prefers-reduced-motion 时只画一帧静态点阵；页面不可见时暂停
 */
export function HeroParticles() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const GAP = 22
    let w = 0
    let h = 0
    let raf = 0
    let glow: Float32Array = new Float32Array(0)
    let cols = 0
    let rows = 0
    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; warm: boolean; life: number }
    let parts: P[] = []

    const spawn = (anyY: boolean): P => ({
      x: Math.random() * w,
      y: anyY ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 1.4,
      vy: -(0.08 + Math.random() * 0.22),
      vx: (Math.random() - 0.5) * 0.08,
      a: 0,
      warm: Math.random() < 0.3,
      life: 0,
    })

    const resize = () => {
      const rect = cv.getBoundingClientRect()
      w = rect.width
      h = rect.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / GAP) + 1
      rows = Math.ceil(h / GAP) + 1
      glow = new Float32Array(cols * rows)
      const n = Math.round(Math.min(48, (w * h) / 16000))
      parts = Array.from({ length: n }, () => spawn(true))
    }

    // 越靠近标题中心越亮，四周淡出
    const falloff = (x: number, y: number) => {
      const dx = (x - w / 2) / (w * 0.55)
      const dy = (y - h * 0.42) / (h * 0.62)
      return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy))
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      // 点阵
      if (!reduce && Math.random() < 0.35) glow[(Math.random() * glow.length) | 0] = 1
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * GAP + GAP / 2
          const y = j * GAP + GAP / 2
          const f = falloff(x, y)
          if (f <= 0) continue
          const k = j * cols + i
          const g = glow[k]
          if (g > 0) glow[k] = Math.max(0, g - 0.012)
          const a = f * (0.16 + g * 0.55)
          ctx.fillStyle = g > 0.05 ? `rgba(120, 186, 255, ${a})` : `rgba(255, 255, 255, ${a})`
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5)
        }
      }
      // 微粒
      for (const p of parts) {
        if (!reduce) {
          p.x += p.vx
          p.y += p.vy
          p.life += 1
        }
        const target = falloff(p.x, p.y) * 0.75
        p.a += (target - p.a) * 0.03
        if (p.y < -10 || p.x < -10 || p.x > w + 10) Object.assign(p, spawn(false))
        ctx.beginPath()
        ctx.fillStyle = p.warm ? `rgba(255, 178, 128, ${p.a})` : `rgba(130, 196, 255, ${p.a})`
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduce) raf = requestAnimationFrame(loop)
    }

    resize()
    if (reduce) {
      for (const p of parts) p.a = falloff(p.x, p.y) * 0.6
      draw()
    } else {
      raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw() })
    ro.observe(cv)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} className="hm-particles" aria-hidden />
}

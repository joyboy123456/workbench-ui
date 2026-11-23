'use client'
import { lazyComponent } from '@/lib/lazy-component'

export const Lightbox = lazyComponent(() => import('./lightbox').then(m => m.Lightbox))
export const ToolLaunchModal = lazyComponent(() => import('./tool-launch-modal').then(m => m.ToolLaunchModal))

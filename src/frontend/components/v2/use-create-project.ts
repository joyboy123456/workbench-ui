'use client'
import { useRef, useState } from 'react'
import { useRouter } from '@/lib/navigation'
import { useV2 } from '@/lib/v2/data-source'
import { createAndOpenProject, singleFlight } from '@/lib/v2/entry-actions'
import { useV2Auth } from './auth'

/** Shared by the sidebar and project list; auth cancellation also releases the lock. */
export function useCreateProject() {
  const ds = useV2()
  const router = useRouter()
  const { requireAuth } = useV2Auth()
  const lock = useRef(singleFlight())
  const navigating = useRef(false)
  const [creating, setCreating] = useState(false)
  const create = () => lock.current(async () => {
    if (navigating.current) return
    setCreating(true)
    try {
      await requireAuth(async () => {
        await createAndOpenProject(() => ds.createProject({}), href => router.push(href))
        navigating.current = true
      })
    } finally { if (!navigating.current) setCreating(false) }
  })
  return { create, creating }
}

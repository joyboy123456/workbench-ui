/** Lock synchronously, including the authentication dialog and route transition. */
export function singleFlight() {
  let active = false
  return async (action: () => Promise<unknown>) => {
    if (active) return
    active = true
    try { return await action() } finally { active = false }
  }
}

/** Navigation is part of creation: callers must await both as one action. */
export async function createAndOpenProject(
  create: () => Promise<{ id: string }>,
  navigate: (href: string) => void,
  toolId?: string,
) {
  const project = await create()
  if (!project?.id) throw new Error('项目创建响应无效，请刷新项目列表确认')
  navigate(`/v2/canvas/${encodeURIComponent(project.id)}?view=split${toolId ? `&tool=${encodeURIComponent(toolId)}` : ''}`)
}

import { CanvasPage } from '@/components/v2/canvas/canvas-page'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CanvasPage id={id} />
}

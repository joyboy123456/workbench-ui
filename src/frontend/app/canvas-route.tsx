import { Navigate, useParams } from 'react-router'
import { CanvasPage } from '@/components/v2/canvas/canvas-page'
import '@xyflow/react/dist/style.css'
import './v2/styles/canvas.css'

export default function CanvasRoute() {
  const { id } = useParams()
  return id ? <CanvasPage id={id} /> : <Navigate to="/v2/projects" replace />
}

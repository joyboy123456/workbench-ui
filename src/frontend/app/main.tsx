import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Outlet, Route, Routes, useParams, useSearchParams } from 'react-router'
import { V2Root } from '@/components/v2/root'
import { Shell } from '@/components/v2/shell'
import { HomePage } from '@/components/v2/home-page'
import { ProductPage } from '@/components/v2/product-page'
import { ProjectsPage } from '@/components/v2/projects-page'
import { ToolsPage } from '@/components/v2/tools-page'
import { AssetsPage } from '@/components/v2/assets-page'
import '@fontsource-variable/inter'
import './globals.css'
import './v2/styles/base.css'
import './v2/styles/video-reference-input.css'
import './v2/styles/workbench.css'

const CanvasRoute = lazy(() => import('./canvas-route'))

function Landing() {
  const [params] = useSearchParams()
  const tool = params.get('tool')?.trim()
  return <Navigate to={tool ? `/v2/tools?tool=${encodeURIComponent(tool)}` : '/v2'} replace />
}

function Workbench() {
  return <Shell><Outlet /></Shell>
}

function ProductRoute() {
  const { id } = useParams()
  return id ? <ProductPage id={id} /> : <Navigate to="/v2/assets" replace />
}

function App() {
  return (
    <HashRouter>
      <V2Root>
        <Routes>
          <Route element={<Workbench />}>
            <Route path="/v2" element={<HomePage />} />
            <Route path="/v2/tools" element={<ToolsPage />} />
            <Route path="/v2/projects" element={<ProjectsPage />} />
            <Route path="/v2/assets" element={<AssetsPage />} />
            <Route path="/v2/assets/products/:id" element={<ProductRoute />} />
          </Route>
          <Route path="/v2/canvas/:id" element={<Suspense fallback={<div className="cv-root" />}><CanvasRoute /></Suspense>} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </V2Root>
    </HashRouter>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing app root')
createRoot(container).render(<App />)

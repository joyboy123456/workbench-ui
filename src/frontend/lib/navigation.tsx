import { useMemo, type ComponentProps } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'

type LocalLinkProps = Omit<ComponentProps<typeof RouterLink>, 'to' | 'prefetch'> & { href: string; prefetch?: boolean }

export function Link({ href, prefetch: _prefetch, ...props }: LocalLinkProps) {
  return <RouterLink {...props} to={href} />
}

export function useRouter() {
  const navigate = useNavigate()
  return useMemo(() => ({
    push: (href: string) => { void navigate(href) },
    replace: (href: string) => { void navigate(href, { replace: true }) },
  }), [navigate])
}

export function usePathname() {
  return useLocation().pathname
}

export function useSearchParams() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

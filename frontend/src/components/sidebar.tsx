'use client'

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useTheme } from '@/contexts/theme-context'
import { useAuth } from '@/contexts/auth-context'
import { Icon } from '@/components/ui/icon'
import { BrandMark } from '@/components/brand-mark'
import { APP_RELEASE, ReleaseNotesModal } from '@/components/release-notes-modal'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const menuItems = [
  { href: '/dashboard', label: 'Operations', shortLabel: 'Home', description: 'Fleet health', icon: 'dashboard' },
  { href: '/devices', label: 'Device Inventory', shortLabel: 'Devices', description: 'ONT and CPE', icon: 'devices' },
  { href: '/network-map', label: 'Network Topology', shortLabel: 'Map', description: 'Physical nodes', icon: 'map' },
  { href: '/settings', label: 'Configuration', shortLabel: 'Settings', description: 'ACS and vendors', icon: 'settings' },
]

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const { pathname } = useLocation()
  const { isDarkMode, toggleDarkMode } = useTheme()

  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  const hideOnRoutes = ['/login', '/setup']
  if (hideOnRoutes.some((route) => pathname.startsWith(route))) return null

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const currentMenu = menuItems.find((item) => isActive(item.href))

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-[1200] flex h-14 items-center justify-between border-b border-border bg-card/85 px-3.5 backdrop-blur-md lg:hidden">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="SkyGenPanel operations">
          <BrandMark className="size-8 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight text-foreground">
              {currentMenu?.label || 'SkyGenPanel'}
            </div>
            <div className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              ACS operations
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            aria-label={isDarkMode ? 'Use light theme' : 'Use dark theme'}
          >
            <Icon name={isDarkMode ? 'sun' : 'moon'} size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={isMobileOpen}
          >
            <Icon name="menu" size={20} />
          </Button>
        </div>
      </header>

      {/* Mobile navigation sheet */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="flex w-[min(85vw,19rem)] flex-col bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Primary panel navigation and account controls</SheetDescription>
          </SheetHeader>
          <SidebarContent
            isCollapsed={false}
            isActive={isActive}
            closeMobile={() => setIsMobileOpen(false)}
            onOpenReleaseNotes={() => {
              setIsMobileOpen(false)
              setShowReleaseNotes(true)
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile bottom tab bar for one-handed navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[1200] grid h-16 grid-cols-4 border-t border-border bg-card/90 backdrop-blur-md lg:hidden"
        aria-label="Mobile quick navigation"
      >
        {menuItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-11 items-center justify-center rounded-full transition-colors',
                  active && 'bg-primary/12'
                )}
              >
                <Icon name={item.icon} size={18} />
              </span>
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          )
        })}
      </nav>

      {/* Desktop collapsible sidebar */}
      <aside
        className={cn(
          'sticky top-0 z-[1000] hidden h-screen max-h-screen shrink-0 self-start flex-col border-r border-sidebar-border bg-sidebar/90 text-sidebar-foreground backdrop-blur-md transition-[width] duration-200 lg:flex',
          isCollapsed ? 'w-[4.5rem]' : 'w-[16.5rem]'
        )}
      >
        <SidebarContent
          isCollapsed={isCollapsed}
          isActive={isActive}
          onOpenReleaseNotes={() => setShowReleaseNotes(true)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setIsCollapsed((value) => !value)}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="absolute -right-3.5 top-16 z-10 size-7 rounded-full bg-background shadow-xs"
        >
          <Icon name={isCollapsed ? 'chevron-right' : 'chevron-left'} size={14} />
        </Button>
      </aside>

      <ReleaseNotesModal open={showReleaseNotes} onClose={() => setShowReleaseNotes(false)} />
    </>
  )
}

function SidebarContent({
  isCollapsed,
  isActive,
  closeMobile,
  onOpenReleaseNotes,
}: {
  isCollapsed: boolean
  isActive: (href: string) => boolean
  closeMobile?: () => void
  onOpenReleaseNotes: () => void
}) {
  const { isDarkMode, toggleDarkMode } = useTheme()
  const { user, logout } = useAuth()
  const displayName = user?.username || 'Operator'
  const initial = displayName.slice(0, 1).toUpperCase()
  const [appName, setAppName] = useState('SkyGenPanel')

  useEffect(() => {
    const syncName = (event?: Event) => {
      const detail = (event as CustomEvent<string> | undefined)?.detail
      setAppName(detail || localStorage.getItem('appName') || 'SkyGenPanel')
    }
    syncName()
    window.addEventListener('appNameChanged', syncName)
    return () => window.removeEventListener('appNameChanged', syncName)
  }, [])

  return (
    <>
      <div className={cn('flex h-16 items-center border-b border-sidebar-border', isCollapsed ? 'justify-center px-2' : 'px-4')}>
        <Link
          to="/dashboard"
          onClick={closeMobile}
          className="flex min-w-0 items-center gap-3"
          title={isCollapsed ? appName : undefined}
        >
          <BrandMark className="size-9 shrink-0" />
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight text-sidebar-foreground">{appName}</div>
              <div className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                ACS operations
              </div>
            </div>
          )}
        </Link>
      </div>

      <nav className={cn('min-h-0 flex-1 overflow-y-auto py-4', isCollapsed ? 'px-2' : 'px-3')} aria-label="Primary">
        {!isCollapsed && (
          <div className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Monitor & manage
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const active = isActive(item.href)
            const linkEl = (
              <Link
                to={item.href}
                onClick={closeMobile}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-h-11 items-center rounded-md transition-colors',
                  isCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                )}
              >
                <Icon
                  name={item.icon}
                  size={19}
                  className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground')}
                />
                {!isCollapsed && (
                  <span className="min-w-0">
                    <span className="block truncate text-sm leading-tight">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[0.7rem] font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                )}
              </Link>
            )

            return (
              <li key={item.href}>
                {isCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  linkEl
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <div className={cn('border-t border-sidebar-border flex flex-col gap-2', isCollapsed ? 'p-2' : 'p-3')}>
        <Button
          type="button"
          variant="ghost"
          size={isCollapsed ? 'icon' : 'sm'}
          onClick={onOpenReleaseNotes}
          className={cn('w-full text-muted-foreground hover:text-sidebar-foreground', !isCollapsed && 'justify-between')}
          aria-label={`Open release notes for SkyGenPanel version ${APP_RELEASE.version}`}
          title={isCollapsed ? `Version ${APP_RELEASE.version} · What’s new` : undefined}
        >
          {isCollapsed ? (
            <span className="font-mono text-[0.65rem] font-semibold">
              v{APP_RELEASE.version.split('.').slice(0, 2).join('.')}
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2 text-xs font-medium">
                <Icon name="info" size={15} />
                What’s new
              </span>
              <Badge variant="secondary" className="font-mono text-[0.65rem]">
                v{APP_RELEASE.version}
              </Badge>
            </>
          )}
        </Button>

        <Separator />

        <div className={cn('flex items-center', isCollapsed ? 'justify-center py-1' : 'gap-2.5 px-1.5 py-1')}>
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">{displayName}</div>
              <div className="text-[0.68rem] text-muted-foreground">Administrator</div>
            </div>
          )}
        </div>

        <div className={cn('grid gap-1.5', isCollapsed ? 'grid-cols-1' : 'grid-cols-2')}>
          <Button
            type="button"
            variant="outline"
            size={isCollapsed ? 'icon' : 'sm'}
            onClick={toggleDarkMode}
            aria-label={isDarkMode ? 'Use light theme' : 'Use dark theme'}
            title={isCollapsed ? (isDarkMode ? 'Light theme' : 'Dark theme') : undefined}
          >
            <Icon name={isDarkMode ? 'sun' : 'moon'} size={16} />
            {!isCollapsed && <span>{isDarkMode ? 'Light' : 'Dark'}</span>}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size={isCollapsed ? 'icon' : 'sm'}
            onClick={logout}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Sign out"
            title={isCollapsed ? 'Sign out' : undefined}
          >
            <Icon name="logout" size={16} />
            {!isCollapsed && <span>Sign out</span>}
          </Button>
        </div>
      </div>
    </>
  )
}

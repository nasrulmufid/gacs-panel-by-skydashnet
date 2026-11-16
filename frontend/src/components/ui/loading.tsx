'use client'

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react'
import { useLocation } from 'react-router'
import { Spinner as ShadcnSpinner } from '@/components/ui/spinner'
import { Skeleton as ShadcnSkeleton } from '@/components/ui/skeleton'

type LoadingContextType = {
  visible: boolean
  message?: string
  show: (message?: string) => void
  hide: () => void
}

const LoadingContext = createContext<LoadingContextType | null>(null)

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)

  const show = useCallback((msg?: string) => {
    setMessage(msg)
    setVisible(true)
  }, [])

  const hide = useCallback(() => {
    setVisible(false)
    setMessage(undefined)
  }, [])

  const value = useMemo<LoadingContextType>(() => ({ visible, message, show, hide }), [visible, message, show, hide])

  return (
    <LoadingContext.Provider value={value}>
      {children}
      {visible && (
        <div
          className="fixed bottom-20 left-4 right-4 z-[2190] flex justify-center sm:left-auto sm:right-5 lg:bottom-5"
          role="status"
          aria-live="polite"
        >
          <div className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 text-popover-foreground shadow-lg sm:w-auto sm:min-w-64">
            <ShadcnSpinner className="size-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">{message || 'Processing request'}</div>
              <div className="text-xs text-muted-foreground">You can keep reviewing this page.</div>
            </div>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const ctx = useContext(LoadingContext)
  if (!ctx) {
    throw new Error('useLoading must be used within LoadingProvider')
  }
  return ctx
}

type SpinnerProps = {
  className?: string
  size?: number
}

export function Spinner({ className, size }: SpinnerProps) {
  return (
    <ShadcnSpinner
      className={className}
      style={size ? { width: size, height: size } : undefined}
    />
  )
}

type SkeletonProps = {
  className?: string
  width?: number | string
  height?: number | string
  rounded?: string
}

export function Skeleton({ className, width = '100%', height = 12 }: SkeletonProps) {
  return <ShadcnSkeleton className={className} style={{ width, height }} />
}

export function RouteChangeLoader() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.documentElement.dataset.route = pathname
  }, [pathname])

  return null
}

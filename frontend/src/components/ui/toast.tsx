'use client'

import React, { createContext, useCallback, useContext, useMemo } from 'react'
import { toast as sonnerToast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  id?: string
  title?: string
  message: string
  type?: ToastType
  durationMs?: number
}

interface ToastContextValue {
  show: (opts: ToastOptions) => string
  success: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) => string
  error: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) => string
  info: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) => string
  warning: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) => string
  dismiss: (id: string) => void
  clearAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const show = useCallback((opts: ToastOptions) => {
    const type = opts.type ?? 'info'
    const duration = opts.durationMs ?? 3500
    const title = opts.title || opts.message
    const description = opts.title ? opts.message : undefined
    const common = {
      id: opts.id,
      description,
      duration,
    }

    const result =
      type === 'success'
        ? sonnerToast.success(title, common)
        : type === 'error'
          ? sonnerToast.error(title, common)
          : type === 'warning'
            ? sonnerToast.warning(title, common)
            : sonnerToast.info(title, common)

    return String(result)
  }, [])

  const success = useCallback(
    (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
      show({ ...opts, message, type: 'success' }),
    [show]
  )

  const error = useCallback(
    (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
      show({ ...opts, message, type: 'error' }),
    [show]
  )

  const info = useCallback(
    (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
      show({ ...opts, message, type: 'info' }),
    [show]
  )

  const warning = useCallback(
    (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
      show({ ...opts, message, type: 'warning' }),
    [show]
  )

  const dismiss = useCallback((id: string) => {
    sonnerToast.dismiss(id)
  }, [])

  const clearAll = useCallback(() => {
    sonnerToast.dismiss()
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ show, success, error, info, warning, dismiss, clearAll }),
    [show, success, error, info, warning, dismiss, clearAll]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

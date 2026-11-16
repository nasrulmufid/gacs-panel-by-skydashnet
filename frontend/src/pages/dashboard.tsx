'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { devicesAPI } from '@/lib/api'
import { Icon } from '@/components/ui/icon'
import { useAuth } from '@/contexts/auth-context'
import { useToast } from '@/components/ui/toast'
import { PieChart } from '@/components/charts/pie-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { TrendChart } from '@/components/charts/trend-chart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Fault {
  id: string
  deviceId: string | null
  channel: string
  code: string
  message: string
  timestamp: string | null
  retries: number
}

interface DashboardData {
  generatedAt?: string
  stats: { total: number; online: number; offline: number; new24h: number }
  rxDistribution: Record<string, number>
  informFreshness: Record<string, number>
  temperatureDistribution: Record<string, number>
  clientDistribution: Record<string, number>
  productClasses: { name: string; value: number }[]
  manufacturers: { name: string; value: number }[]
  registrations: { name: string; value: number }[]
  faults: Fault[]
  faultsError: string | null
}

const EMPTY: DashboardData = {
  stats: { total: 0, online: 0, offline: 0, new24h: 0 },
  rxDistribution: {},
  informFreshness: {},
  temperatureDistribution: {},
  clientDistribution: {},
  productClasses: [],
  manufacturers: [],
  registrations: [],
  faults: [],
  faultsError: null,
}

const PALETTES = {
  rx: { Excellent: '#10b981', Good: '#0ea5e9', Poor: '#f59e0b', Danger: '#ef4444', Unknown: '#64748b' },
  freshness: { 'Under 10m': '#10b981', '10–60m': '#0ea5e9', '1–24h': '#f59e0b', 'Over 24h': '#ef4444' },
  temperature: { Normal: '#10b981', Warm: '#f59e0b', Hot: '#ef4444', Unknown: '#64748b' },
  clients: { '0': '#64748b', '1–5': '#0ea5e9', '6–15': '#6366f1', '16+': '#f97316', Unknown: '#94a3b8' },
}

const DASHBOARD_SESSION_KEY = 'skygenpanel.dashboard.snapshot.v1'

function readDashboardSession(): DashboardData | null {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.stats && parsed?.rxDistribution ? (parsed as DashboardData) : null
  } catch {
    return null
  }
}

function writeDashboardSession(data: DashboardData) {
  try {
    sessionStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify(data))
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
}

function pieData(distribution: Record<string, number>, palette: Record<string, string>) {
  return Object.entries(distribution)
    .map(([name, value]) => ({ name, value: Number(value) || 0, color: palette[name] || '#64748b' }))
    .filter((entry) => entry.value > 0)
}

function formatFaultTime(timestamp: string | null) {
  if (!timestamp) return 'Unknown time'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
}

export default function DashboardPage() {
  const [cachedDashboard] = useState<DashboardData | null>(() => readDashboardSession())
  const [data, setData] = useState<DashboardData>(cachedDashboard || EMPTY)
  const [initialLoading, setInitialLoading] = useState(!cachedDashboard)
  const [refreshing, setRefreshing] = useState(false)
  const [faultsLoading, setFaultsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [clearingFault, setClearingFault] = useState<string | null>(null)
  const [pendingFault, setPendingFault] = useState<Fault | null>(null)
  const faultsLoadedRef = useRef(false)
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const loadDashboard = useCallback(async (force = false) => {
    setLoadError('')
    setRefreshing(true)
    try {
      const response = await devicesAPI.getDashboard(force)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Dashboard data is unavailable')
      }
      const incoming = response.data as DashboardData
      setData((current) => {
        const next = faultsLoadedRef.current
          ? { ...incoming, faults: current.faults, faultsError: current.faultsError }
          : incoming
        writeDashboardSession(next)
        return next
      })
      const generatedAt = incoming.generatedAt ? new Date(incoming.generatedAt) : new Date()
      setLastUpdated(Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Panel could not reach GenieACS')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadFaults = useCallback(async () => {
    setFaultsLoading(true)
    try {
      const response = await devicesAPI.getFaults(50)
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.message || 'Fault list is unavailable')
      }
      faultsLoadedRef.current = true
      setData((current) => {
        const next = { ...current, faults: response.data as Fault[], faultsError: null }
        writeDashboardSession(next)
        return next
      })
    } catch {
      faultsLoadedRef.current = true
      setData((current) => ({ ...current, faultsError: 'Fault list could not be loaded from GenieACS.' }))
    } finally {
      setFaultsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (cachedDashboard?.generatedAt) {
      const cachedDate = new Date(cachedDashboard.generatedAt)
      if (!Number.isNaN(cachedDate.getTime())) setLastUpdated(cachedDate)
    }
    void loadDashboard(false)
    void loadFaults()
  }, [cachedDashboard, loadDashboard, loadFaults])

  const rxData = useMemo(() => pieData(data.rxDistribution, PALETTES.rx), [data.rxDistribution])
  const freshnessData = useMemo(() => pieData(data.informFreshness, PALETTES.freshness), [data.informFreshness])
  const temperatureData = useMemo(() => pieData(data.temperatureDistribution, PALETTES.temperature), [data.temperatureDistribution])
  const clientData = useMemo(() => pieData(data.clientDistribution, PALETTES.clients), [data.clientDistribution])
  const productData = useMemo(() => [...data.productClasses].reverse(), [data.productClasses])
  const manufacturerData = useMemo(() => [...data.manufacturers].reverse(), [data.manufacturers])

  const availability = data.stats.total ? Math.round((data.stats.online / data.stats.total) * 100) : 0
  const signalRisk = (data.rxDistribution.Poor || 0) + (data.rxDistribution.Danger || 0)

  const confirmClearFault = async () => {
    if (!pendingFault) return
    const fault = pendingFault
    setPendingFault(null)
    try {
      setClearingFault(fault.id)
      const response = await devicesAPI.clearFault(fault.id)
      if (!response.success) throw new Error(response.message || 'Fault could not be cleared')
      setData((current) => ({ ...current, faults: current.faults.filter((entry) => entry.id !== fault.id) }))
      toast.success('Fault cleared from GenieACS')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fault could not be cleared')
    } finally {
      setClearingFault(null)
    }
  }

  if (initialLoading) {
    return (
      <div className="page-shell">
        <div className="page-frame flex flex-col gap-5">
          <header className="page-header">
            <div>
              <p className="page-kicker">Fleet operations</p>
              <h1 className="page-title">Network condition</h1>
              <p className="page-description">Loading compact operational summary from GenieACS…</p>
            </div>
          </header>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" role="status">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-28 w-full rounded-lg" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-56 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col gap-5">
        <header className="page-header mb-0">
          <div>
            <p className="page-kicker">Fleet operations</p>
            <h1 className="page-title">Network condition</h1>
            <p className="page-description">
              Ringkasan fleet, optical health, client load, dan fault untuk {user?.username || 'operator'}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                : 'No update yet'}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void loadDashboard(true)}
            >
              {refreshing ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} />}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </header>

        {loadError && (
          <Alert variant="destructive">
            <Icon name="warning" size={16} />
            <AlertTitle>Connection issue</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void loadDashboard(true)}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* KPI Cards: 2-col on mobile, 4-col on xl */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            { label: 'Total devices', value: data.stats.total, icon: 'server', color: 'text-foreground' },
            { label: 'Online now', value: data.stats.online, icon: 'check', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Needs contact', value: data.stats.offline, icon: 'warning', color: 'text-destructive' },
            { label: 'New in 24h', value: data.stats.new24h, icon: 'bell', color: 'text-primary' },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="metric-label">{kpi.label}</CardDescription>
                <Icon name={kpi.icon} size={18} className="text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className={`mt-0 font-mono text-4xl font-bold leading-none tracking-tight sm:text-5xl ${kpi.color}`}>
                  {kpi.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Availability hero + Operator queue */}
        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="overflow-hidden">
            <div className="grid min-h-52 sm:grid-cols-[1fr_1.25fr]">
              <div className="flex flex-col justify-between bg-primary p-5 text-primary-foreground sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
                    Online availability
                  </p>
                  <p className="mt-2 font-mono text-4xl font-bold tracking-tight sm:text-5xl">
                    {availability}%
                  </p>
                </div>
                <div className="mt-6 flex flex-col gap-2.5">
                  <Progress
                    value={availability}
                    className="h-2 bg-primary-foreground/20 [&>[data-slot=progress-indicator]]:bg-primary-foreground"
                  />
                  <p className="text-xs leading-5 text-primary-foreground/90 sm:text-sm">
                    {data.stats.online} dari {data.stats.total} perangkat melapor dalam 10 menit terakhir.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2">
                <div className="border-b border-r border-border p-4 sm:p-5">
                  <p className="metric-label">Optical risk</p>
                  <p className="metric-value text-amber-600 dark:text-amber-400">{signalRisk}</p>
                </div>
                <div className="border-b border-border p-4 sm:p-5">
                  <p className="metric-label">Active faults</p>
                  <p className="metric-value text-destructive">{data.faults.length}</p>
                </div>
                <div className="border-r border-border p-4 sm:p-5">
                  <p className="metric-label">Hot devices</p>
                  <p className="metric-value">{data.temperatureDistribution.Hot || 0}</p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="metric-label">16+ clients</p>
                  <p className="metric-value">{data.clientDistribution['16+'] || 0}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div>
                <CardTitle className="text-base">Operator queue</CardTitle>
                <CardDescription>Prioritas gangguan pelanggan.</CardDescription>
              </div>
              <Icon name="bell" size={18} className="text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border pt-0">
              <Link to="/devices" className="flex min-h-14 items-center justify-between py-3 transition-colors hover:text-primary">
                <span>
                  <strong className="block text-sm font-medium">Offline devices</strong>
                  <small className="text-muted-foreground">Review last Inform</small>
                </span>
                <Badge variant={data.stats.offline > 0 ? 'destructive' : 'secondary'} className="font-mono">
                  {data.stats.offline}
                </Badge>
              </Link>
              <div className="flex min-h-14 items-center justify-between py-3">
                <span>
                  <strong className="block text-sm font-medium">GenieACS faults</strong>
                  <small className="text-muted-foreground">Provisioning failures</small>
                </span>
                <Badge variant={data.faults.length > 0 ? 'destructive' : 'secondary'} className="font-mono">
                  {data.faults.length}
                </Badge>
              </div>
              <Link to="/devices" className="flex min-h-14 items-center justify-between py-3 transition-colors hover:text-primary">
                <span>
                  <strong className="block text-sm font-medium">Weak optical signal</strong>
                  <small className="text-muted-foreground">Poor or danger RX</small>
                </span>
                <Badge variant={signalRisk > 0 ? 'outline' : 'secondary'} className="font-mono text-amber-600 dark:text-amber-400">
                  {signalRisk}
                </Badge>
              </Link>
            </CardContent>
          </Card>
        </section>

        {/* Distribution charts */}
        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Optical signal distribution</CardTitle>
              <CardDescription>RX power health across the fleet.</CardDescription>
            </CardHeader>
            <CardContent>
              {rxData.length ? <PieChart data={rxData} /> : <p className="py-12 text-center text-sm text-muted-foreground">No RX power data.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inform freshness</CardTitle>
              <CardDescription>How recently devices contacted GenieACS.</CardDescription>
            </CardHeader>
            <CardContent>
              {freshnessData.length ? <PieChart data={freshnessData} /> : <p className="py-12 text-center text-sm text-muted-foreground">No Inform data.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Temperature health</CardTitle>
              <CardDescription>Reported ONT temperature buckets.</CardDescription>
            </CardHeader>
            <CardContent>
              {temperatureData.length ? <PieChart data={temperatureData} /> : <p className="py-12 text-center text-sm text-muted-foreground">No temperature data.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected client load</CardTitle>
              <CardDescription>Active subscriber devices per ONT.</CardDescription>
            </CardHeader>
            <CardContent>
              {clientData.length ? <PieChart data={clientData} /> : <p className="py-12 text-center text-sm text-muted-foreground">No client count data.</p>}
            </CardContent>
          </Card>
        </section>

        {/* Trend & vendor charts */}
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">7-day registrations</CardTitle>
              <CardDescription>New CPE registrations reported per day.</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart data={data.registrations} valueLabel="Registrations" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manufacturers</CardTitle>
              <CardDescription>Largest vendor groups.</CardDescription>
            </CardHeader>
            <CardContent>
              {manufacturerData.length ? <BarChart data={manufacturerData} /> : <p className="py-12 text-center text-sm text-muted-foreground">No manufacturer data.</p>}
            </CardContent>
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Product classes</CardTitle>
              <CardDescription>Largest device model families.</CardDescription>
            </CardHeader>
            <CardContent>
              {productData.length ? <BarChart data={productData} /> : <p className="py-12 text-center text-sm text-muted-foreground">No product class data.</p>}
            </CardContent>
          </Card>
        </section>

        {/* Faults list: Desktop Table + Mobile Card List */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">GenieACS fault list</CardTitle>
              <CardDescription>Active provisioning and connection faults from the NBI.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={data.faults.length ? 'destructive' : 'secondary'}>
                {faultsLoading ? 'Refreshing…' : `${data.faults.length} active`}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={faultsLoading}
                onClick={() => void loadFaults()}
              >
                <Icon name="refresh" size={15} className={faultsLoading ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </div>
          </CardHeader>

          {data.faultsError && (
            <div className="border-b border-border bg-amber-500/10 px-5 py-3 text-sm text-amber-700 dark:text-amber-300">
              {data.faultsError}
            </div>
          )}

          {!data.faults.length ? (
            <CardContent className="py-10">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon name="check" size={20} />
                  </EmptyMedia>
                  <EmptyTitle>No active GenieACS faults</EmptyTitle>
                  <EmptyDescription>
                    Semua provisioning dan komunikasi TR-069 berjalan normal.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Channel / code</TableHead>
                      <TableHead>Message</TableHead>
                      {isAdmin && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.faults.slice(0, 25).map((fault) => (
                      <TableRow key={fault.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatFaultTime(fault.timestamp)}
                        </TableCell>
                        <TableCell className="max-w-56 break-all font-mono text-xs">
                          {fault.deviceId || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">{fault.code}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {fault.channel}{fault.retries ? ` · retry ${fault.retries}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xl whitespace-normal text-sm">
                          {fault.message}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={clearingFault === fault.id}
                              onClick={() => setPendingFault(fault)}
                            >
                              {clearingFault === fault.id && <Spinner data-icon="inline-start" />}
                              {clearingFault === fault.id ? 'Clearing…' : 'Clear fault'}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card Stack */}
              <div className="flex flex-col divide-y divide-border md:hidden">
                {data.faults.slice(0, 25).map((fault) => (
                  <div key={fault.id} className="flex flex-col gap-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="destructive">{fault.code}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {fault.channel}{fault.retries ? ` · retry ${fault.retries}` : ''}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFaultTime(fault.timestamp)}
                      </span>
                    </div>
                    <p className="break-all font-mono text-xs font-medium text-foreground">
                      {fault.deviceId || '—'}
                    </p>
                    <p className="text-sm text-muted-foreground">{fault.message}</p>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-1 w-full"
                        disabled={clearingFault === fault.id}
                        onClick={() => setPendingFault(fault)}
                      >
                        {clearingFault === fault.id && <Spinner data-icon="inline-start" />}
                        {clearingFault === fault.id ? 'Clearing…' : 'Clear fault'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingFault)} onOpenChange={(open) => { if (!open) setPendingFault(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear GenieACS fault?</AlertDialogTitle>
            <AlertDialogDescription>
              Fault <span className="font-mono font-semibold">{pendingFault?.code}</span> untuk perangkat{' '}
              <span className="font-mono">{pendingFault?.deviceId || 'unknown device'}</span> akan dihapus dari antrean GenieACS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmClearFault()}>Clear fault</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

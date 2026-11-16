import { FormEvent, useCallback, useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { Icon } from '@/components/ui/icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

type PortalOverview = {
  customerId: string
  status: 'online' | 'offline'
  lastInform: string | null
  lastBoot: string | null
  registered: string | null
  ont: {
    manufacturer: unknown
    model: unknown
    serialNumber: unknown
    hardwareVersion: unknown
    softwareVersion: unknown
    uptimeSeconds: unknown
  }
  optical: { rxPower: unknown; temperature: unknown }
  connectedDevices: unknown
  wifi: Array<{
    index: number
    ssid: unknown
    enabled: boolean | null
    connectedDevices: unknown
    hasSavedPassword?: boolean
  }>
  generatedAt: string
}

type ApiResult<T> = { success: boolean; message?: string; data?: T }
type WifiEditor = { index: number; ssid: string; password: string }

async function portalRequest<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(`/api/customer${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json')
    ? await response.json()
    : { success: false, message: 'Respons portal tidak valid' }
  if (!response.ok) return { ...result, success: false }
  return result
}

function text(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Belum dilaporkan'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return 'Belum dilaporkan'
}

function dateTime(value: string | null) {
  if (!value) return 'Belum dilaporkan'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Belum dilaporkan'
    : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function uptime(value: unknown) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return 'Belum dilaporkan'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days} hari` : '', hours ? `${hours} jam` : '', `${minutes} menit`]
    .filter(Boolean)
    .join(' ')
}

function MetricCard({
  icon, label, value, helper
}: {
  icon: string
  label: string
  value: string
  helper?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="metric-label">{label}</CardDescription>
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon name={icon} size={16} />
        </span>
      </CardHeader>
      <CardContent>
        <p className="break-words text-xl font-bold tracking-tight">{value}</p>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  )
}

export default function CustomerPortal() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [password, setPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [overview, setOverview] = useState<PortalOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [wifiEditor, setWifiEditor] = useState<WifiEditor | null>(null)
  const [wifiSaving, setWifiSaving] = useState(false)
  const [showWifiPassword, setShowWifiPassword] = useState(false)
  const [visibleSavedPasswordIndex, setVisibleSavedPasswordIndex] = useState<number | null>(null)
  const [revealedWifiPasswords, setRevealedWifiPasswords] = useState<Record<number, string>>({})
  const [revealingWifiPasswordIndex, setRevealingWifiPasswordIndex] = useState<number | null>(null)
  const [wifiFeedback, setWifiFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await portalRequest<PortalOverview>('/overview')
      if (!result.success || !result.data) {
        if (result.message?.toLowerCase().includes('session')) setAuthenticated(false)
        setError(result.message || 'Informasi ONT belum dapat dimuat.')
        return
      }
      setOverview(result.data)
    } catch {
      setError('Portal tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void portalRequest<{ customerId: string }>('/session')
      .then((result) => {
        if (cancelled) return
        setAuthenticated(result.success)
        if (result.success) void loadOverview()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })
    return () => { cancelled = true }
  }, [loadOverview])

  useEffect(() => {
    if (!authenticated) return
    const timer = window.setInterval(() => void loadOverview(), 60_000)
    return () => window.clearInterval(timer)
  }, [authenticated, loadOverview])

  useEffect(() => {
    if (authenticated) return
    setOverview(null)
    setWifiEditor(null)
    setShowWifiPassword(false)
    setVisibleSavedPasswordIndex(null)
    setRevealedWifiPasswords({})
    setRevealingWifiPasswordIndex(null)
    setWifiFeedback(null)
  }, [authenticated])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await portalRequest<{ customerId: string }>('/login', {
        method: 'POST',
        body: JSON.stringify({ customerId, password }),
      })
      if (!result.success) {
        setError(result.message || 'ID Customer atau password salah.')
        return
      }
      setAuthenticated(true)
      setPassword('')
      setShowLoginPassword(false)
      await loadOverview()
    } catch {
      setError('Portal tidak dapat terhubung ke server. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await portalRequest('/logout', { method: 'POST' })
    setAuthenticated(false)
    setOverview(null)
    setCustomerId('')
    setPassword('')
    setShowLoginPassword(false)
  }

  const openWifiEditor = (index: number, ssid: unknown) => {
    setWifiEditor({ index, ssid: text(ssid), password: '' })
    setShowWifiPassword(false)
    setVisibleSavedPasswordIndex(null)
    setWifiFeedback(null)
  }

  const toggleSavedWifiPassword = async (index: number) => {
    if (visibleSavedPasswordIndex === index) {
      setVisibleSavedPasswordIndex(null)
      return
    }
    if (revealedWifiPasswords[index]) {
      setVisibleSavedPasswordIndex(index)
      return
    }

    setRevealingWifiPasswordIndex(index)
    setWifiFeedback(null)
    try {
      const result = await portalRequest<{ password: string }>(`/wifi/${index}/password`)
      if (!result.success || !result.data?.password) {
        if (result.message?.toLowerCase().includes('session')) setAuthenticated(false)
        setWifiFeedback({
          type: 'error',
          message: result.message || 'Password WiFi belum dapat dibuka.',
        })
        return
      }
      setRevealedWifiPasswords((current) => ({
        ...current,
        [index]: result.data!.password,
      }))
      setVisibleSavedPasswordIndex(index)
    } catch {
      setWifiFeedback({
        type: 'error',
        message: 'Portal tidak dapat terhubung ke server. Coba lagi.',
      })
    } finally {
      setRevealingWifiPasswordIndex(null)
    }
  }

  const saveWifi = async (event: FormEvent) => {
    event.preventDefault()
    if (!wifiEditor) return
    const ssid = wifiEditor.ssid.trim()
    if (!ssid || ssid.length > 32) {
      setWifiFeedback({ type: 'error', message: 'Nama WiFi harus berisi 1 sampai 32 karakter.' })
      return
    }
    if (wifiEditor.password && !/^[\x20-\x7e]{8,63}$/.test(wifiEditor.password)) {
      setWifiFeedback({ type: 'error', message: 'Password WiFi harus terdiri dari 8 sampai 63 karakter.' })
      return
    }

    setWifiSaving(true)
    setWifiFeedback(null)
    try {
      const result = await portalRequest<{ index: number; ssid: string }>('/wifi', {
        method: 'PUT',
        body: JSON.stringify({
          index: wifiEditor.index,
          ssid,
          password: wifiEditor.password,
        }),
      })
      if (!result.success) {
        if (result.message?.toLowerCase().includes('session')) setAuthenticated(false)
        setWifiFeedback({
          type: 'error',
          message: result.message || 'Perubahan WiFi belum dapat dikirim.',
        })
        return
      }
      setOverview((current) =>
        current
          ? {
              ...current,
              wifi: current.wifi.map((network) =>
                network.index === wifiEditor.index
                  ? {
                      ...network,
                      ssid,
                      hasSavedPassword: Boolean(wifiEditor.password) || network.hasSavedPassword,
                    }
                  : network
              ),
            }
          : current
      )
      setWifiEditor(null)
      setShowWifiPassword(false)
      setWifiFeedback({
        type: 'success',
        message: result.message || 'Perubahan WiFi dikirim ke ONT.',
      })
    } catch {
      setWifiFeedback({
        type: 'error',
        message: 'Portal tidak dapat terhubung ke server. Coba lagi.',
      })
    } finally {
      setWifiSaving(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-5">
        <div className="flex flex-col items-center gap-3 text-center" aria-live="polite">
          <BrandMark className="size-12" title="SkyGenPanel" />
          <Spinner className="size-6 text-primary" />
          <p className="text-sm text-muted-foreground">Memeriksa sesi portal…</p>
        </div>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md">
          <header className="mb-6 flex items-center gap-3">
            <BrandMark className="size-11 shrink-0" title="SkyGenPanel" />
            <div>
              <p className="text-lg font-bold">SkyGenPanel</p>
              <p className="text-sm text-muted-foreground">Portal pelanggan</p>
            </div>
          </header>
          <Card>
            <CardHeader>
              <p className="page-kicker">Akses mandiri pelanggan</p>
              <CardTitle className="text-2xl font-bold">Periksa kondisi ONT</CardTitle>
              <CardDescription>
                Masukkan ID Customer yang diberikan penyedia layanan. Password awal adalah enam karakter terakhir ID.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={login}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="customer-id">ID Customer</FieldLabel>
                    <Input
                      id="customer-id"
                      className="font-mono uppercase"
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value.toUpperCase())}
                      autoComplete="username"
                      maxLength={19}
                      placeholder="CSG-XXXXXXX-XXXXXX"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="customer-password">Password</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="customer-password"
                        className="font-mono"
                        type={showLoginPassword ? 'text' : 'password'}
                        inputMode="text"
                        pattern="[A-Za-z0-9]{6}"
                        maxLength={6}
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))
                        }
                        autoComplete="current-password"
                        placeholder="6 karakter"
                        required
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          type="button"
                          size="icon-xs"
                          onClick={() => setShowLoginPassword((visible) => !visible)}
                          aria-label={showLoginPassword ? 'Sembunyikan password login' : 'Tampilkan password login'}
                          aria-pressed={showLoginPassword}
                        >
                          <Icon name={showLoginPassword ? 'eye-off' : 'eye'} size={16} />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>
                {error && (
                  <Alert variant="destructive">
                    <Icon name="warning" size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button className="w-full" type="submit" disabled={loading} size="lg">
                  {loading ? <Spinner data-icon="inline-start" /> : <Icon name="lock" size={16} />}
                  {loading ? 'Memeriksa…' : 'Masuk ke portal'}
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
            Data berasal dari laporan terakhir ONT ke sistem operator.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-9 shrink-0" title="SkyGenPanel" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Portal Pelanggan</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{overview?.customerId || customerId}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={logout}>
            <Icon name="logout" size={16} />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Ringkasan koneksi</p>
            <h1 className="page-title">Kondisi internet rumah Anda</h1>
            <p className="page-description">Status ONT, sinyal optik, dan WiFi berdasarkan laporan perangkat terakhir.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadOverview()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} />}
            Perbarui
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <Icon name="warning" size={16} />
            <AlertTitle>Data belum tersedia</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadOverview()}>
                Coba lagi
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!overview && loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Memuat informasi ONT">
            {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32 w-full rounded-lg" />)}
          </div>
        ) : overview ? (
          <>
            {overview.status === 'offline' && (
              <Alert>
                <Icon name="warning" size={16} />
                <AlertDescription>
                  ONT belum mengirim laporan dalam 10 menit terakhir. Periksa daya dan kabel fiber sebelum menghubungi operator.
                </AlertDescription>
              </Alert>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Metrik koneksi">
              <MetricCard
                icon="power"
                label="Status ONT"
                value={overview.status === 'online' ? 'Online' : 'Offline'}
                helper={`Inform terakhir ${dateTime(overview.lastInform)}`}
              />
              <MetricCard
                icon="signal"
                label="Sinyal optik RX"
                value={`${text(overview.optical.rxPower)}${text(overview.optical.rxPower) === 'Belum dilaporkan' ? '' : ' dBm'}`}
              />
              <MetricCard
                icon="thermometer"
                label="Suhu perangkat"
                value={`${text(overview.optical.temperature)}${text(overview.optical.temperature) === 'Belum dilaporkan' ? '' : ' °C'}`}
              />
              <MetricCard
                icon="phone"
                label="Perangkat terhubung"
                value={text(overview.connectedDevices)}
                helper="Total klien yang dilaporkan ONT"
              />
            </section>

            <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informasi ONT</CardTitle>
                  <CardDescription>Identitas dan kondisi perangkat di lokasi pelanggan.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {[
                      ['Pabrikan', text(overview.ont.manufacturer)],
                      ['Model', text(overview.ont.model)],
                      ['Serial number', text(overview.ont.serialNumber)],
                      ['Hardware', text(overview.ont.hardwareVersion)],
                      ['Software', text(overview.ont.softwareVersion)],
                      ['Uptime', uptime(overview.ont.uptimeSeconds)],
                      ['Boot terakhir', dateTime(overview.lastBoot)],
                      ['Terdaftar', dateTime(overview.registered)],
                    ].map(([label, value]) => (
                      <div key={label} className="border-b border-border pb-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="mt-1 break-words font-mono text-sm">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Jaringan WiFi</CardTitle>
                  <CardDescription>Lihat atau ubah nama dan password jaringan di ONT Anda.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {wifiFeedback && (
                    <Alert variant={wifiFeedback.type === 'error' ? 'destructive' : 'default'}>
                      <Icon name={wifiFeedback.type === 'error' ? 'warning' : 'check'} size={16} />
                      <AlertDescription>{wifiFeedback.message}</AlertDescription>
                    </Alert>
                  )}

                  {overview.wifi.length ? (
                    <div className="flex flex-col gap-3">
                      {overview.wifi.map((network) => (
                        <article key={network.index} className="rounded-lg border border-border bg-muted/30 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{text(network.ssid)}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">WiFi #{network.index}</p>
                            </div>
                            <Badge variant={network.enabled === false ? 'destructive' : network.enabled === true ? 'secondary' : 'outline'}>
                              {network.enabled === false
                                ? 'Nonaktif'
                                : network.enabled === true
                                  ? 'Aktif'
                                  : 'Belum dilaporkan'}
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">
                            <strong className="text-foreground">{text(network.connectedDevices)}</strong> perangkat terhubung
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                Password tersimpan
                              </p>
                              <p className="mt-0.5 truncate font-mono text-sm">
                                {network.hasSavedPassword
                                  ? visibleSavedPasswordIndex === network.index && revealedWifiPasswords[network.index]
                                    ? revealedWifiPasswords[network.index]
                                    : '••••••••••••'
                                  : 'Belum tersimpan'}
                              </p>
                            </div>
                            {network.hasSavedPassword && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={revealingWifiPasswordIndex === network.index}
                                onClick={() => void toggleSavedWifiPassword(network.index)}
                                aria-label={
                                  visibleSavedPasswordIndex === network.index
                                    ? 'Sembunyikan password tersimpan'
                                    : 'Tampilkan password tersimpan'
                                }
                                aria-pressed={visibleSavedPasswordIndex === network.index}
                              >
                                <Icon
                                  name={
                                    revealingWifiPasswordIndex === network.index
                                      ? 'refresh'
                                      : visibleSavedPasswordIndex === network.index
                                        ? 'eye-off'
                                        : 'eye'
                                  }
                                  size={16}
                                  className={revealingWifiPasswordIndex === network.index ? 'animate-spin' : ''}
                                />
                              </Button>
                            )}
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Hanya password terakhir yang pernah dikirim melalui portal ini.
                          </p>
                          {wifiEditor?.index === network.index ? (
                            <form className="mt-4 flex flex-col gap-4 border-t border-border pt-4" onSubmit={saveWifi}>
                              <FieldGroup>
                                <Field>
                                  <FieldLabel htmlFor={`wifi-ssid-${network.index}`}>Nama WiFi</FieldLabel>
                                  <Input
                                    id={`wifi-ssid-${network.index}`}
                                    value={wifiEditor.ssid}
                                    maxLength={32}
                                    onChange={(event) =>
                                      setWifiEditor((current) =>
                                        current ? { ...current, ssid: event.target.value } : current
                                      )
                                    }
                                    autoComplete="off"
                                    required
                                  />
                                  <FieldDescription>Maksimal 32 karakter.</FieldDescription>
                                </Field>
                                <Field>
                                  <FieldLabel htmlFor={`wifi-password-${network.index}`}>Password baru</FieldLabel>
                                  <InputGroup>
                                    <InputGroupInput
                                      id={`wifi-password-${network.index}`}
                                      className="font-mono"
                                      type={showWifiPassword ? 'text' : 'password'}
                                      value={wifiEditor.password}
                                      minLength={wifiEditor.password ? 8 : undefined}
                                      maxLength={63}
                                      onChange={(event) =>
                                        setWifiEditor((current) =>
                                          current ? { ...current, password: event.target.value } : current
                                        )
                                      }
                                      autoComplete="new-password"
                                      placeholder="Kosongkan jika tidak diubah"
                                    />
                                    <InputGroupAddon align="inline-end">
                                      <InputGroupButton
                                        type="button"
                                        size="icon-xs"
                                        onClick={() => setShowWifiPassword((visible) => !visible)}
                                        aria-label={showWifiPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                        aria-pressed={showWifiPassword}
                                      >
                                        <Icon name={showWifiPassword ? 'eye-off' : 'eye'} size={16} />
                                      </InputGroupButton>
                                    </InputGroupAddon>
                                  </InputGroup>
                                  <FieldDescription>
                                    8–63 karakter. Kosongkan untuk mempertahankan password saat ini.
                                  </FieldDescription>
                                </Field>
                              </FieldGroup>
                              <Alert>
                                <Icon name="warning" size={16} />
                                <AlertDescription className="text-xs">
                                  Perangkat yang memakai jaringan ini dapat terputus dan harus tersambung ulang setelah perubahan diterapkan.
                                </AlertDescription>
                              </Alert>
                              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={wifiSaving}
                                  onClick={() => setWifiEditor(null)}
                                >
                                  Batal
                                </Button>
                                <Button
                                  type="submit"
                                  disabled={
                                    wifiSaving ||
                                    (!wifiEditor.password && wifiEditor.ssid.trim() === text(network.ssid))
                                  }
                                >
                                  {wifiSaving ? <Spinner data-icon="inline-start" /> : <Icon name="check" size={16} />}
                                  {wifiSaving ? 'Mengirim…' : 'Simpan perubahan'}
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-4 w-full"
                              onClick={() => openWifiEditor(network.index, network.ssid)}
                            >
                              <Icon name="edit" size={16} />
                              Ubah nama atau password
                            </Button>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Icon name="wifi" size={20} />
                        </EmptyMedia>
                        <EmptyTitle>WiFi belum dilaporkan</EmptyTitle>
                        <EmptyDescription>
                          Data akan muncul setelah ONT mengirim parameter WiFi.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Data diperbarui {dateTime(overview.generatedAt)} · otomatis setiap 60 detik
            </p>
          </>
        ) : null}
      </div>
    </main>
  )
}

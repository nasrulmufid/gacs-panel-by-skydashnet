'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import { devicesAPI, vendorsAPI } from '@/lib/api'
import { useLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/toast'
import { Icon } from '@/components/ui/icon'
import { formatDate } from '@/lib/utils'
import type { Device, Vendor } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ProcessedDevice extends Device {
  isOnline: boolean
  brand: string
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<ProcessedDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [loadError, setLoadError] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  const loadingCtl = useLoading()
  const toast = useToast()

  const getSignalStrengthInfo = (rxPowerStr: unknown) => {
    const rxpower = parseFloat(String(rxPowerStr))

    if (Number.isNaN(rxpower)) {
      return {
        color: 'text-muted-foreground',
        label: 'N/A',
      }
    }

    if (rxpower >= -21.99) {
      return {
        color: 'text-emerald-600 dark:text-emerald-400',
        label: 'Excellent',
      }
    }
    if (rxpower >= -24.99) {
      return {
        color: 'text-primary',
        label: 'Good',
      }
    }
    if (rxpower >= -26.99) {
      return {
        color: 'text-amber-600 dark:text-amber-400',
        label: 'Poor',
      }
    }
    return {
      color: 'text-destructive',
      label: 'Danger',
    }
  }

  const findBrand = useCallback((manufacturer: string, productClass: string, vendors: Vendor[]) => {
    const man = manufacturer?.toLowerCase() || ''
    const prod = productClass?.toLowerCase() || ''

    const sortedVendors = [...vendors].sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const vendor of sortedVendors) {
      const manPatterns = vendor.manufacturer_patterns || []
      const prodPatterns = vendor.product_patterns || []

      const manMatch = manPatterns.some((p: string) => man.includes(p.toLowerCase()))
      const prodMatch = prodPatterns.some((p: string) => prod.includes(p.toLowerCase()))

      if (manMatch || prodMatch) {
        return vendor.name
      }
    }

    return man || 'Unknown'
  }, [])

  const processDeviceData = useCallback((rawDevices: Device[], vendors: Vendor[]) => {
    const now = new Date()
    return rawDevices.map((item: Device) => {
      const lastInform = item._lastInform ? new Date(item._lastInform) : null
      const lastInformMs = lastInform?.getTime()
      const ageMs = lastInformMs === undefined ? Number.NaN : now.getTime() - lastInformMs
      const isOnline = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 10 * 60 * 1000

      const manufacturer = item.manufacturer || ''
      const productClass = item.productclass || 'Unknown'
      const brand = findBrand(manufacturer, productClass, vendors)

      return {
        ...item,
        isOnline,
        brand,
      }
    })
  }, [findBrand])

  const handleSummon = async (e: React.MouseEvent, deviceId: string) => {
    e.preventDefault()
    e.stopPropagation()

    loadingCtl.show('Summoning device...')
    try {
      const res = await devicesAPI.summonDevice(deviceId)
      if (res.success) {
        toast.success(res.message || 'Summon command sent!')
      } else {
        toast.error(res.message || 'Failed to send summon')
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error sending summon command')
    } finally {
      loadingCtl.hide()
    }
  }

  const handleRemoteAccess = async (e: React.MouseEvent, device: ProcessedDevice) => {
    e.preventDefault()
    e.stopPropagation()

    loadingCtl.show('Preparing remote proxy session...')
    try {
      const res = await devicesAPI.prepareRemoteSession(device._id)
      if (!res.success || !res.data?.url) {
        toast.error(res.message || 'Could not prepare remote session')
        return
      }
      if (!res.data.enabled) {
        toast.warning('Remote Device Proxy belum diaktifkan di Settings → Panel & ACS.')
      }
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error opening remote session')
    } finally {
      loadingCtl.hide()
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')

    const fetchData = async () => {
      try {
        const [devicesRes, vendorsRes] = await Promise.all([
          devicesAPI.getDevices(),
          vendorsAPI.getAll(),
        ])

        if (cancelled) return

        if (devicesRes.success && vendorsRes.success) {
          const rawDevices = devicesRes.data as Device[]
          const vendors = vendorsRes.data as Vendor[]
          setDevices(processDeviceData(rawDevices, vendors))
        } else {
          setLoadError('GenieACS did not return the device inventory. Verify the ACS URL and network access, then retry.')
        }
      } catch {
        if (!cancelled) {
          setLoadError('Panel could not reach GenieACS. Check the ACS connection, then retry.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchData()

    return () => { cancelled = true }
  }, [processDeviceData, refreshNonce])

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const search = searchTerm.toLowerCase()
      const statusMatch =
        filterStatus === 'all' ||
        (filterStatus === 'online' && device.isOnline) ||
        (filterStatus === 'offline' && !device.isOnline)

      const searchMatch =
        !search ||
        (device._id || '').toLowerCase().includes(search) ||
        (device.SerialNumber || '').toLowerCase().includes(search) ||
        device.brand.toLowerCase().includes(search) ||
        (device.productclass || '').toLowerCase().includes(search) ||
        device.pppoe?.toLowerCase().includes(search) ||
        device.customerId?.toLowerCase().includes(search) ||
        device.ipTr069?.toLowerCase().includes(search)

      return statusMatch && searchMatch
    })
  }, [devices, searchTerm, filterStatus])

  if (loading) {
    return (
      <div className="page-shell">
        <div className="page-frame flex flex-col gap-5">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  const totalOnline = devices.filter((device) => device.isOnline).length
  const totalOffline = devices.length - totalOnline
  const hasFilters = Boolean(searchTerm) || filterStatus !== 'all'

  const DeviceStatus = ({ device }: { device: ProcessedDevice }) => (
    <Badge variant={device.isOnline ? 'secondary' : 'destructive'} className="gap-1.5">
      <span
        className={`size-1.5 rounded-full ${device.isOnline ? 'bg-emerald-500' : 'bg-destructive-foreground'}`}
      />
      {device.isOnline ? 'Online' : 'Offline'}
    </Badge>
  )

  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col gap-5">
        <header className="page-header mb-0">
          <div>
            <p className="page-kicker">GenieACS inventory</p>
            <h1 className="page-title">Managed devices</h1>
            <p className="page-description">
              Cari ONT berdasarkan serial, pelanggan PPPoE, vendor, atau product class lalu buka detail konfigurasi.
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {totalOnline} online / {devices.length} total
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setRefreshNonce((value) => value + 1)}
              aria-label="Refresh device inventory"
            >
              <Icon name="refresh" size={16} />
            </Button>
          </div>
        </header>

        {loadError ? (
          <Card>
            <CardContent className="py-12">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon name="warning" size={20} className="text-destructive" />
                  </EmptyMedia>
                  <EmptyTitle>Device inventory is unavailable</EmptyTitle>
                  <EmptyDescription>{loadError}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row flex-wrap justify-center gap-2">
                  <Button type="button" onClick={() => setRefreshNonce((value) => value + 1)}>
                    Retry inventory
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/settings">Check ACS configuration</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile-friendly search & status filter bar */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-3.5 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <label htmlFor="device-search" className="sr-only">Search inventory</label>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <Icon name="search" size={16} />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="device-search"
                      type="search"
                      placeholder="Cari Serial, Customer ID, PPPoE, brand, atau model…"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </InputGroup>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Tabs value={filterStatus} onValueChange={setFilterStatus}>
                    <TabsList>
                      <TabsTrigger value="all">
                        All ({devices.length})
                      </TabsTrigger>
                      <TabsTrigger value="online">
                        Online ({totalOnline})
                      </TabsTrigger>
                      <TabsTrigger value="offline">
                        Offline ({totalOffline})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {hasFilters && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearchTerm(''); setFilterStatus('all') }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {filteredDevices.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Icon name={hasFilters ? 'search' : 'server'} size={20} />
                      </EmptyMedia>
                      <EmptyTitle>
                        {hasFilters ? 'No devices match these filters' : 'No devices have reported yet'}
                      </EmptyTitle>
                      <EmptyDescription>
                        {hasFilters
                          ? 'Ubah kata pencarian atau tampilkan semua status untuk memperluas hasil.'
                          : 'Periksa koneksi GenieACS dan tunggu Inform pertama dari ONT.'}
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      {hasFilters ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => { setSearchTerm(''); setFilterStatus('all') }}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <Button asChild>
                          <Link to="/settings">Check ACS connection</Link>
                        </Button>
                      )}
                    </EmptyContent>
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Desktop Table */}
                <Card className="hidden overflow-hidden md:block">
                  <div className="max-h-[calc(100vh-19rem)] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Serial / Device ID</TableHead>
                          <TableHead>Vendor & model</TableHead>
                          <TableHead>Subscriber</TableHead>
                          <TableHead>IP TR-069</TableHead>
                          <TableHead>Customer ID</TableHead>
                          <TableHead>Optical RX</TableHead>
                          <TableHead>Last Inform</TableHead>
                          <TableHead className="text-right">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDevices.map((device) => {
                          const signalInfo = getSignalStrengthInfo(device.rxpower)
                          return (
                            <TableRow key={device._id}>
                              <TableCell><DeviceStatus device={device} /></TableCell>
                              <TableCell className="max-w-[18rem]">
                                <Link
                                  to={`/devices/detail?id=${encodeURIComponent(device._id)}`}
                                  className="block truncate font-mono text-sm font-semibold text-primary hover:underline"
                                >
                                  {device.SerialNumber || device._id}
                                </Link>
                                {device.SerialNumber && (
                                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                                    {device._id}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="block font-medium">{device.brand}</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {device.productclass || 'Model not reported'}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {device.pppoe || 'Not reported'}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {device.ipTr069 ? (
                                  <span className="font-semibold text-foreground">{device.ipTr069}</span>
                                ) : (
                                  <span className="text-muted-foreground">N/A</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-semibold">
                                {device.customerId || 'Not generated'}
                              </TableCell>
                              <TableCell>
                                <span className={`font-mono text-sm font-semibold ${signalInfo.color}`}>
                                  {device.rxpower !== null && device.rxpower !== undefined
                                    ? `${device.rxpower} dBm`
                                    : 'N/A'}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {signalInfo.label}
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDate(device._lastInform)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {device.ipTr069 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={(event) => void handleRemoteAccess(event, device)}
                                      title={`Remote Web (${device.SerialNumber || device._id} → ${device.ipTr069})`}
                                      aria-label={`Remote ${device.SerialNumber || device._id}`}
                                    >
                                      <Icon name="globe" size={16} />
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={(event) => void handleSummon(event, device._id)}
                                    title="Request a new Inform"
                                    aria-label={`Summon ${device.SerialNumber || device._id}`}
                                  >
                                    <Icon name="bell" size={16} />
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" asChild>
                                    <Link
                                      to={`/devices/detail?id=${encodeURIComponent(device._id)}`}
                                      aria-label={`Open ${device.SerialNumber || device._id}`}
                                    >
                                      <Icon name="chevron-right" size={16} />
                                    </Link>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* Mobile Card List */}
                <section className="flex flex-col gap-3 md:hidden" aria-label="Device inventory">
                  {filteredDevices.map((device) => {
                    const signalInfo = getSignalStrengthInfo(device.rxpower)
                    return (
                      <Card key={device._id}>
                        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                          <div className="min-w-0 flex-1">
                            <DeviceStatus device={device} />
                            <Link
                              to={`/devices/detail?id=${encodeURIComponent(device._id)}`}
                              className="mt-2 block truncate font-mono text-sm font-semibold text-primary"
                            >
                              {device.SerialNumber || device._id}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {device.brand} · {device.productclass || 'Unknown model'}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon-sm" asChild className="shrink-0">
                            <Link
                              to={`/devices/detail?id=${encodeURIComponent(device._id)}`}
                              aria-label={`Open ${device.SerialNumber || device._id}`}
                            >
                              <Icon name="chevron-right" size={18} />
                            </Link>
                          </Button>
                        </CardHeader>

                        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">PPPoE</dt>
                            <dd className="mt-0.5 truncate font-mono text-xs">{device.pppoe || 'Not reported'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">IP TR-069</dt>
                            <dd className="mt-0.5 truncate font-mono text-xs font-semibold">
                              {device.ipTr069 || 'N/A'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Customer ID</dt>
                            <dd className="mt-0.5 truncate font-mono text-xs font-semibold">
                              {device.customerId || 'Not generated'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Optical RX</dt>
                            <dd className={`mt-0.5 font-mono text-xs font-semibold ${signalInfo.color}`}>
                              {device.rxpower ?? 'N/A'}
                              {device.rxpower !== null && device.rxpower !== undefined ? ' dBm' : ''}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Last Inform</dt>
                            <dd className="mt-0.5 truncate text-xs text-muted-foreground">
                              {formatDate(device._lastInform)}
                            </dd>
                          </div>
                        </CardContent>

                        <CardFooter className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={(event) => void handleSummon(event, device._id)}
                          >
                            <Icon name="bell" size={15} />
                            Summon
                          </Button>
                          <Button
                            type="button"
                            variant={device.ipTr069 ? 'default' : 'outline'}
                            size="sm"
                            className="w-full"
                            disabled={!device.ipTr069}
                            onClick={(event) => void handleRemoteAccess(event, device)}
                          >
                            <Icon name="globe" size={15} />
                            Remote Web
                          </Button>
                        </CardFooter>
                      </Card>
                    )
                  })}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

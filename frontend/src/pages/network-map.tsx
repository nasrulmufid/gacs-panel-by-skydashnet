'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from '@/contexts/theme-context'
import { devicesAPI, mappingAPI, mapSettingsAPI } from '@/lib/api'
import { copyToClipboard, formatDate } from '@/lib/utils'
import type { Device } from '@/types'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import 'leaflet/dist/leaflet.css'

// Start fetching the map engine as soon as this route chunk is evaluated. The
// topology request and Leaflet download can then run in parallel.
const leafletModulePromise = import('leaflet')

type NodeType = 'htb' | 'olt' | 'odc' | 'odp' | 'ont' | 'server'
type FiberType = 'backbone' | 'feeder' | 'distribution' | 'drop' | 'patch'

interface MapNode {
  id: number
  node_id: string
  type: NodeType
  name: string
  latitude: number
  longitude: number
  capacity?: number | null
  splitter?: string | null
  pppoe?: string | null
  notes?: string | null
}

interface MapEdge {
  id: number
  edge_id: string
  source: string
  target: string
  fiber_type: FiberType
  distance?: number | null
  waypoints?: [number, number][] | null
  notes?: string | null
}

type NodeForm = Omit<MapNode, 'id'>
type EdgeForm = Omit<MapEdge, 'id'>
type PinnedLiveDevice = Device & { latitude: number; longitude: number }

function isDeviceOnline(lastInform?: string) {
  if (!lastInform) return false
  const ms = new Date(lastInform).getTime()
  if (!Number.isFinite(ms)) return false
  const ageMs = Date.now() - ms
  return ageMs >= 0 && ageMs < 10 * 60 * 1000
}

function getDeviceSsids(device: Device) {
  const ssids = [
    device.ssid1,
    device.ssid2,
    device.ssid3,
    device.ssid4,
    device.ssid5,
    device.ssid6,
    device.ssid7,
    device.ssid8,
  ]
    .map((val) => (typeof val === 'string' ? val.trim() : ''))
    .filter(Boolean)
  const unique = Array.from(new Set(ssids))
  return unique.length > 0 ? unique.join(', ') : '—'
}

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: 'htb', label: 'HTB' },
  { value: 'olt', label: 'OLT' },
  { value: 'odc', label: 'ODC' },
  { value: 'odp', label: 'ODP' },
  { value: 'ont', label: 'ONT' },
  { value: 'server', label: 'Server' },
]

const FIBER_TYPES: { value: FiberType; label: string; color: string }[] = [
  { value: 'backbone', label: 'Backbone', color: '#8b5cf6' },
  { value: 'feeder', label: 'Feeder', color: '#0ea5e9' },
  { value: 'distribution', label: 'Distribution', color: '#22c55e' },
  { value: 'drop', label: 'Drop cable', color: '#f59e0b' },
  { value: 'patch', label: 'Patch', color: '#94a3b8' },
]

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getTypeLabel(type: NodeType) {
  return NODE_TYPES.find((entry) => entry.value === type)?.label || type.toUpperCase()
}

function getFiberMeta(type: FiberType) {
  return FIBER_TYPES.find((entry) => entry.value === type) || FIBER_TYPES[2]
}

function getTileUrlAndAttrib() {
  return {
    // Hide POI markers (s.t:2), transit icons (s.t:4), and label icons (s.e:l.i)
    // while keeping satellite imagery, road names, and city/district titles.
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=id&gl=id&apistyle=s.t%3A2%7Cp.v%3Aoff%2Cs.t%3A4%7Cp.v%3Aoff%2Cs.e%3Al.i%7Cp.v%3Aoff',
    attribution: 'Map data &copy; Google'
  }
}

function getNodeSvg(type: NodeType) {
  const paths: Record<NodeType, string> = {
    htb: '<path d="M5 20V8l7-4 7 4v12"/><path d="M8 20v-6h8v6"/><path d="M9 9h6"/>',
    olt: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h4M15 13h2"/><circle cx="7" cy="16" r=".5"/>',
    odc: '<path d="M6 22V4a1 1 0 011-1h10a1 1 0 011 1v18"/><path d="M10 7h.01M14 7h.01M10 11h.01M14 11h.01"/>',
    odp: '<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4"/><path d="M12 11v10"/>',
    ont: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 001 1h14a1 1 0 001-1V10"/><path d="M9 17h6"/>',
    server: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/>',
  }
  return paths[type]
}

function nodeIconName(type: NodeType) {
  if (type === 'server' || type === 'olt') return 'server'
  if (type === 'odc' || type === 'htb') return 'building'
  if (type === 'odp') return 'box'
  return 'home'
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function NodeEditor({
  initial, editing, saving, onClose, onSave
}: {
  initial: NodeForm
  editing: boolean
  saving: boolean
  onClose: () => void
  onSave: (value: NodeForm) => void
}) {
  const [form, setForm] = useState(initial)
  const set = <K extends keyof NodeForm>(key: K, value: NodeForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return (
    <ModalShell title={editing ? `Edit ${initial.node_id}` : 'Add network node'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="flex flex-col gap-5">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="node-id">Node ID</FieldLabel>
            <Input
              id="node-id"
              className="font-mono"
              required
              maxLength={128}
              pattern="[A-Za-z0-9._:-]+"
              disabled={editing}
              value={form.node_id}
              onChange={(event) => set('node_id', event.target.value)}
              placeholder="ODP-ZONE-001"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-type">Type</FieldLabel>
            <Select value={form.type} onValueChange={(value) => set('type', value as NodeType)}>
              <SelectTrigger id="node-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {NODE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="node-name">Name</FieldLabel>
            <Input
              id="node-name"
              required
              maxLength={255}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="ODP Jalan Merdeka"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-lat">Latitude</FieldLabel>
            <Input
              id="node-lat"
              className="font-mono"
              required
              type="number"
              min={-90}
              max={90}
              step="any"
              value={form.latitude}
              onChange={(event) => set('latitude', Number(event.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-lng">Longitude</FieldLabel>
            <Input
              id="node-lng"
              className="font-mono"
              required
              type="number"
              min={-180}
              max={180}
              step="any"
              value={form.longitude}
              onChange={(event) => set('longitude', Number(event.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-capacity">Capacity</FieldLabel>
            <Input
              id="node-capacity"
              type="number"
              min={0}
              step={1}
              value={form.capacity ?? ''}
              onChange={(event) => set('capacity', event.target.value === '' ? null : Number(event.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-splitter">Splitter</FieldLabel>
            <Input
              id="node-splitter"
              maxLength={64}
              value={form.splitter ?? ''}
              onChange={(event) => set('splitter', event.target.value)}
              placeholder="1:8"
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="node-pppoe">PPPoE / subscriber reference</FieldLabel>
            <Input
              id="node-pppoe"
              maxLength={255}
              value={form.pppoe ?? ''}
              onChange={(event) => set('pppoe', event.target.value)}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="node-notes">Notes</FieldLabel>
            <Textarea
              id="node-notes"
              maxLength={5000}
              value={form.notes ?? ''}
              onChange={(event) => set('notes', event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : <Icon name="check" size={16} />}
            {saving ? 'Saving…' : 'Save node'}
          </Button>
        </DialogFooter>
      </form>
    </ModalShell>
  )
}

function EdgeEditor({
  initial, nodes, editing, saving, onClose, onSave
}: {
  initial: EdgeForm
  nodes: MapNode[]
  editing: boolean
  saving: boolean
  onClose: () => void
  onSave: (value: EdgeForm) => void
}) {
  const [form, setForm] = useState(initial)
  const set = <K extends keyof EdgeForm>(key: K, value: EdgeForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return (
    <ModalShell title={editing ? `Edit ${initial.edge_id}` : 'Draw fiber cable'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="flex flex-col gap-5">
        {nodes.length < 2 && (
          <Alert>
            <Icon name="warning" size={16} />
            <AlertDescription>Add at least two nodes before drawing a cable.</AlertDescription>
          </Alert>
        )}
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="edge-id">Cable ID</FieldLabel>
            <Input
              id="edge-id"
              className="font-mono"
              required
              maxLength={128}
              pattern="[A-Za-z0-9._:-]+"
              disabled={editing}
              value={form.edge_id}
              onChange={(event) => set('edge_id', event.target.value)}
              placeholder="FBR-ODC01-ODP01"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edge-source">Source node</FieldLabel>
            <Select value={form.source} onValueChange={(value) => set('source', value)}>
              <SelectTrigger id="edge-source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {nodes.map((node) => (
                    <SelectItem key={node.node_id} value={node.node_id}>
                      {node.name} ({node.node_id})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="edge-target">Target node</FieldLabel>
            <Select value={form.target} onValueChange={(value) => set('target', value)}>
              <SelectTrigger id="edge-target">
                <SelectValue placeholder="Select target" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {nodes.map((node) => (
                    <SelectItem key={node.node_id} value={node.node_id}>
                      {node.name} ({node.node_id})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="edge-fiber">Fiber type</FieldLabel>
            <Select value={form.fiber_type} onValueChange={(value) => set('fiber_type', value as FiberType)}>
              <SelectTrigger id="edge-fiber">
                <SelectValue placeholder="Select fiber type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {FIBER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="edge-distance">Distance (meter)</FieldLabel>
            <Input
              id="edge-distance"
              type="number"
              min={0}
              step="any"
              value={form.distance ?? ''}
              onChange={(event) => set('distance', event.target.value === '' ? null : Number(event.target.value))}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="edge-notes">Notes</FieldLabel>
            <Textarea
              id="edge-notes"
              maxLength={5000}
              value={form.notes ?? ''}
              onChange={(event) => set('notes', event.target.value)}
            />
          </Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          The cable is drawn automatically between both nodes. Existing route waypoints are preserved when editing.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || nodes.length < 2 || !form.source || !form.target || form.source === form.target}>
            {saving ? <Spinner data-icon="inline-start" /> : <Icon name="check" size={16} />}
            {saving ? 'Saving…' : 'Save cable'}
          </Button>
        </DialogFooter>
      </form>
    </ModalShell>
  )
}

export default function NetworkMap() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusDeviceId = searchParams.get('device') || ''
  const [nodes, setNodes] = useState<MapNode[]>([])
  const [edges, setEdges] = useState<MapEdge[]>([])
  const [liveDevices, setLiveDevices] = useState<PinnedLiveDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<MapEdge | null>(null)
  const [selectedLiveDevice, setSelectedLiveDevice] = useState<PinnedLiveDevice | null>(null)
  const [showLiveDevices, setShowLiveDevices] = useState(true)
  const [nodeEditor, setNodeEditor] = useState<NodeForm | null>(null)
  const [edgeEditor, setEdgeEditor] = useState<EdgeForm | null>(null)
  const [editingNode, setEditingNode] = useState(false)
  const [editingEdge, setEditingEdge] = useState(false)
  const [pendingDeleteNode, setPendingDeleteNode] = useState<MapNode | null>(null)
  const [pendingDeleteEdge, setPendingDeleteEdge] = useState<MapEdge | null>(null)
  const [mapView, setMapView] = useState<'map' | 'list'>('map')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>([-6.2088, 106.8456])
  const [defaultZoom, setDefaultZoom] = useState(12)
  const [minZoom, setMinZoom] = useState(5)
  const [maxZoom, setMaxZoom] = useState(18)
  const { isDarkMode } = useTheme()
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const cablesLayerRef = useRef<any>(null)
  const devicesLayerRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const hasCenteredAssetsRef = useRef(false)
  const focusedDeviceHandledRef = useRef('')

  const normalizeNodes = (data: unknown): MapNode[] =>
    (Array.isArray(data) ? data : []).map((raw: any) => ({
      id: Number(raw.id),
      node_id: String(raw.node_id),
      type: raw.type as NodeType,
      name: String(raw.name),
      latitude: Number(raw.latitude),
      longitude: Number(raw.longitude),
      capacity: raw.capacity === null ? null : Number(raw.capacity),
      splitter: raw.splitter || null,
      pppoe: raw.pppoe || null,
      notes: raw.notes || null,
    })).filter((node) => Number.isFinite(node.latitude) && Number.isFinite(node.longitude))

  const normalizeEdges = (data: unknown): MapEdge[] =>
    (Array.isArray(data) ? data : []).map((raw: any) => ({
      id: Number(raw.id),
      edge_id: String(raw.edge_id),
      source: String(raw.source),
      target: String(raw.target),
      fiber_type: raw.fiber_type as FiberType,
      distance: raw.distance === null ? null : Number(raw.distance),
      waypoints: Array.isArray(raw.waypoints) ? raw.waypoints : null,
      notes: raw.notes || null,
    }))

  const normalizeLiveDevices = (data: unknown): PinnedLiveDevice[] =>
    (Array.isArray(data) ? data : [])
      .filter((raw: any) => (
        raw &&
        raw.latitude !== null &&
        raw.latitude !== undefined &&
        raw.longitude !== null &&
        raw.longitude !== undefined &&
        Number.isFinite(Number(raw.latitude)) &&
        Number.isFinite(Number(raw.longitude))
      ))
      .map((raw: any) => ({
        ...(raw as Device),
        latitude: Number(raw.latitude),
        longitude: Number(raw.longitude),
      }))

  const loadData = useCallback(async (withSettings = true) => {
    try {
      setLoading(true)
      const requests: Promise<any>[] = [
        mappingAPI.getNodes(),
        mappingAPI.getEdges(),
        devicesAPI.getDevices().catch(() => ({ success: false, data: [] })),
      ]
      if (withSettings) requests.push(mapSettingsAPI.get())
      const [nodesRes, edgesRes, devicesRes, settingsRes] = await Promise.all(requests)
      if (!nodesRes.success || !edgesRes.success) throw new Error('Topology data could not be loaded')
      setNodes(normalizeNodes(nodesRes.data))
      setEdges(normalizeEdges(edgesRes.data))
      if (devicesRes?.success) {
        const nextLive = normalizeLiveDevices(devicesRes.data)
        setLiveDevices(nextLive)
        setSelectedLiveDevice((current) => {
          if (!current) return null
          return nextLive.find((d) => d._id === current._id) || current
        })
      }
      const settings = settingsRes?.data as any
      if (settings) {
        const center: [number, number] = [Number(settings.center_lat), Number(settings.center_lng)]
        if (center.every(Number.isFinite)) setMapCenter(center)
        if (Number.isFinite(Number(settings.default_zoom))) setDefaultZoom(Number(settings.default_zoom))
        if (Number.isFinite(Number(settings.max_zoom_out))) setMinZoom(Number(settings.max_zoom_out))
        if (Number.isFinite(Number(settings.max_zoom_in))) setMaxZoom(Number(settings.max_zoom_in))
      }
      setLastRefresh(new Date())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed loading network topology')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => () => {
    mapRef.current?.remove()
    mapRef.current = null
    markersLayerRef.current = null
    cablesLayerRef.current = null
    devicesLayerRef.current = null
    tileLayerRef.current = null
  }, [])

  const updateTileLayer = useCallback(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const tile = getTileUrlAndAttrib()
    tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 20 }).addTo(map)
  }, [])

  const updateMapObjects = useCallback(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    markersLayerRef.current ||= L.layerGroup().addTo(map)
    cablesLayerRef.current ||= L.layerGroup().addTo(map)
    devicesLayerRef.current ||= L.layerGroup().addTo(map)
    markersLayerRef.current.clearLayers()
    cablesLayerRef.current.clearLayers()
    devicesLayerRef.current.clearLayers()

    const byId = new Map(nodes.map((node) => [node.node_id, node]))
    edges.forEach((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) return
      const points: [number, number][] = [
        [source.latitude, source.longitude],
        ...(edge.waypoints || []),
        [target.latitude, target.longitude],
      ]
      const meta = getFiberMeta(edge.fiber_type)
      const line = L.polyline(points, {
        color: meta.color,
        weight: edge.fiber_type === 'backbone' ? 5 : 3,
        opacity: 0.9,
        dashArray: edge.fiber_type === 'drop' ? '7 7' : undefined,
      }).addTo(cablesLayerRef.current)
      line.bindTooltip(`<strong>${escapeHtml(edge.edge_id)}</strong><br>${escapeHtml(meta.label)} · ${escapeHtml(edge.source)} → ${escapeHtml(edge.target)}`)
      line.on('click', () => { setSelectedEdge(edge); setSelectedNode(null); setSelectedLiveDevice(null) })
    })

    nodes.forEach((node) => {
      const iconColor = isDarkMode ? '#f4f3ed' : '#173f35'
      const html = `<div style="width:28px;height:28px;padding:3px;border-radius:8px;background:${isDarkMode ? '#17211c' : '#fff'};border:1px solid ${isDarkMode ? '#53615a' : '#bdc9c2'};box-shadow:0 2px 6px rgba(0,0,0,.2)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${getNodeSvg(node.type)}</svg></div>`
      const marker = L.marker([node.latitude, node.longitude], {
        icon: L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] })
      }).addTo(markersLayerRef.current)
      marker.bindTooltip(`<strong>${escapeHtml(node.name)}</strong><br>${escapeHtml(getTypeLabel(node.type))} · ${escapeHtml(node.node_id)}`)
      marker.on('click', () => { setSelectedNode(node); setSelectedEdge(null); setSelectedLiveDevice(null) })
    })

    if (showLiveDevices) {
      liveDevices.forEach((dev) => {
        const online = isDeviceOnline(dev._lastInform)
        const bg = online ? '#10b981' : '#ef4444'
        const halo = online ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.24)'
        const html = `<div style="width:28px;height:28px;border-radius:9999px;background:${bg};border:2px solid #ffffff;box-shadow:0 0 0 4px ${halo},0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#ffffff"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="19.5" r="1"/></svg></div>`
        const marker = L.marker([dev.latitude, dev.longitude], {
          icon: L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] }),
          zIndexOffset: 250,
        }).addTo(devicesLayerRef.current)
        const label = escapeHtml(dev.SerialNumber || dev._id)
        const pppoeLabel = escapeHtml(dev.pppoe || '—')
        marker.bindTooltip(
          `<strong>${label}</strong><br>${online ? '● Online' : '○ Offline'} · PPPoE: ${pppoeLabel}`
        )
        marker.on('click', () => {
          setSelectedLiveDevice(dev)
          setSelectedNode(null)
          setSelectedEdge(null)
        })
      })
    }

    if (focusDeviceId && focusedDeviceHandledRef.current !== focusDeviceId) {
      const target = liveDevices.find((dev) => dev._id === focusDeviceId)
      if (target) {
        map.setView([target.latitude, target.longitude], Math.min(maxZoom, 17))
        setSelectedLiveDevice(target)
        focusedDeviceHandledRef.current = focusDeviceId
        hasCenteredAssetsRef.current = true
      }
    }

    const centerSource = nodes.length ? nodes : (showLiveDevices ? liveDevices : [])
    if (centerSource.length && !hasCenteredAssetsRef.current) {
      const center = centerSource.reduce(
        (total, item) => [total[0] + item.latitude, total[1] + item.longitude] as [number, number],
        [0, 0] as [number, number]
      )
      map.setView(
        [center[0] / centerSource.length, center[1] / centerSource.length],
        Math.min(maxZoom, Math.max(minZoom, 15))
      )
      hasCenteredAssetsRef.current = true
    }
  }, [edges, focusDeviceId, isDarkMode, liveDevices, maxZoom, minZoom, nodes, showLiveDevices])

  useEffect(() => {
    if (mapView !== 'map') return
    let cancelled = false
    void (async () => {
      if (!leafletRef.current) {
        const module = await leafletModulePromise
        leafletRef.current = (module as any).default ?? module
      }
      if (cancelled || !mapContainerRef.current) return
      const L = leafletRef.current
      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, { center: mapCenter, zoom: defaultZoom, minZoom, maxZoom })
        markersLayerRef.current = L.layerGroup().addTo(mapRef.current)
        cablesLayerRef.current = L.layerGroup().addTo(mapRef.current)
        devicesLayerRef.current = L.layerGroup().addTo(mapRef.current)
        updateTileLayer()
      }
      mapRef.current.setMinZoom(minZoom)
      mapRef.current.setMaxZoom(maxZoom)
      if (!nodes.length && !liveDevices.length) mapRef.current.setView(mapCenter, defaultZoom)
      updateMapObjects()
      window.setTimeout(() => mapRef.current?.invalidateSize(), 80)
    })()
    return () => { cancelled = true }
  }, [defaultZoom, liveDevices.length, mapCenter, mapView, maxZoom, minZoom, nodes.length, updateMapObjects, updateTileLayer])
  useEffect(() => { if (mapRef.current) updateTileLayer() }, [updateTileLayer])
  useEffect(() => { if (mapRef.current) updateMapObjects() }, [updateMapObjects])

  const openNewNode = () => {
    const center = mapRef.current?.getCenter()
    setEditingNode(false)
    setNodeEditor({
      node_id: '', type: 'odp', name: '',
      latitude: Number(center?.lat ?? mapCenter[0]),
      longitude: Number(center?.lng ?? mapCenter[1]),
      capacity: null, splitter: '', pppoe: '', notes: ''
    })
  }
  const openNewEdge = () => {
    setEditingEdge(false)
    setEdgeEditor({
      edge_id: '', source: nodes[0]?.node_id || '', target: nodes[1]?.node_id || '',
      fiber_type: 'distribution', distance: null, waypoints: null, notes: ''
    })
  }

  const saveNode = async (form: NodeForm) => {
    try {
      setSaving(true)
      const response = editingNode
        ? await mappingAPI.updateNode(form.node_id, form)
        : await mappingAPI.createNode(form)
      if (!response.success) throw new Error(response.message || 'Node could not be saved')
      toast.success(editingNode ? 'Node updated' : 'Node added')
      setNodeEditor(null)
      setSelectedNode(null)
      await loadData(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Node could not be saved')
    } finally {
      setSaving(false)
    }
  }
  const saveEdge = async (form: EdgeForm) => {
    try {
      setSaving(true)
      const response = editingEdge
        ? await mappingAPI.updateEdge(form.edge_id, form)
        : await mappingAPI.createEdge(form)
      if (!response.success) throw new Error(response.message || 'Cable could not be saved')
      toast.success(editingEdge ? 'Cable updated' : 'Cable drawn')
      setEdgeEditor(null)
      setSelectedEdge(null)
      await loadData(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cable could not be saved')
    } finally {
      setSaving(false)
    }
  }
  const confirmDeleteNode = async () => {
    if (!pendingDeleteNode) return
    const node = pendingDeleteNode
    setPendingDeleteNode(null)
    try {
      const response = await mappingAPI.deleteNode(node.node_id)
      if (!response.success) throw new Error(response.message || 'Node could not be deleted')
      toast.success('Node deleted')
      setSelectedNode(null)
      await loadData(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Node could not be deleted')
    }
  }
  const confirmDeleteEdge = async () => {
    if (!pendingDeleteEdge) return
    const edge = pendingDeleteEdge
    setPendingDeleteEdge(null)
    try {
      const response = await mappingAPI.deleteEdge(edge.edge_id)
      if (!response.success) throw new Error(response.message || 'Cable could not be deleted')
      toast.success('Cable deleted')
      setSelectedEdge(null)
      await loadData(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cable could not be deleted')
    }
  }

  const nodeCounts = useMemo(() => NODE_TYPES.map((type) => ({
    ...type, count: nodes.filter((node) => node.type === type.value).length
  })), [nodes])
  const onlineLiveCount = useMemo(
    () => liveDevices.filter((dev) => isDeviceOnline(dev._lastInform)).length,
    [liveDevices]
  )

  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col gap-5">
        <header className="page-header mb-0">
          <div>
            <p className="page-kicker">Outside plant</p>
            <h1 className="page-title">Network topology</h1>
            <p className="page-description">Kelola HTB, OLT, ODC, ODP, ONT, jalur kabel fiber, serta pantau titik live device langsung pada peta.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Button type="button" size="sm" onClick={openNewNode}>
                <Icon name="pin" size={16} />
                Add node
              </Button>
            )}
            {isAdmin && (
              <Button type="button" variant="outline" size="sm" onClick={openNewEdge}>
                <Icon name="signal" size={16} />
                Draw cable
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadData(false)}>
              {loading ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} />}
              Refresh
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription className="metric-label">Nodes</CardDescription></CardHeader>
            <CardContent><p className="metric-value mt-0">{nodes.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="metric-label">Fiber cables</CardDescription></CardHeader>
            <CardContent><p className="metric-value mt-0">{edges.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="metric-label">OLT / ODC</CardDescription></CardHeader>
            <CardContent><p className="metric-value mt-0">{nodes.filter((n) => n.type === 'olt' || n.type === 'odc').length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="metric-label">Live Devices</CardDescription></CardHeader>
            <CardContent>
              <p className="metric-value mt-0">
                {liveDevices.length}
                <span className="ml-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  ({onlineLiveCount} online)
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="metric-label">Last refresh</CardDescription></CardHeader>
            <CardContent><p className="font-mono text-sm font-semibold">{lastRefresh?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) || '—'}</p></CardContent>
          </Card>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {nodeCounts.map((entry) => (
              <Badge key={entry.value} variant="secondary" className="font-mono">
                {entry.label} {entry.count}
              </Badge>
            ))}
            <button
              type="button"
              onClick={() => setShowLiveDevices((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 font-mono text-xs font-semibold transition-colors ${showLiveDevices
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-border bg-muted text-muted-foreground'
                }`}
            >
              <span className={`size-2 rounded-full ${showLiveDevices ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              LIVE ONT {liveDevices.length}
            </button>
          </div>
          <Tabs value={mapView} onValueChange={(value) => setMapView(value as 'map' | 'list')}>
            <TabsList>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="list">Inventory</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative">
          <Card className={`overflow-hidden ${mapView === 'map' ? '' : 'hidden'}`}>
            <CardHeader className="flex flex-col gap-3 border-b border-border py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Physical fiber map</CardTitle>
                <CardDescription>Click a node, fiber cable, or live device marker (hijau = online, merah = offline) to inspect details.</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit text-xs">Google Satellite</Badge>
            </CardHeader>
            <div className="relative z-0 isolate h-[58vh] min-h-[24rem] max-h-[54rem]">
              <div ref={mapContainerRef} className="h-full w-full" />
            </div>
          </Card>

          <section className={`flex flex-col gap-4 ${mapView === 'list' ? '' : 'hidden'}`}>
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border py-4">
                <CardTitle className="text-base">Nodes ({nodes.length})</CardTitle>
              </CardHeader>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Coordinates</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nodes.map((node) => (
                      <TableRow key={node.node_id}>
                        <TableCell className="font-mono text-sm">{node.node_id}</TableCell>
                        <TableCell>{node.name}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Icon name={nodeIconName(node.type)} size={16} />
                            {getTypeLabel(node.type)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{node.latitude.toFixed(6)}, {node.longitude.toFixed(6)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedNode(node)}>Details</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!nodes.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No nodes mapped yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col divide-y divide-border md:hidden">
                {nodes.map((node) => (
                  <div key={node.node_id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getTypeLabel(node.type)}</Badge>
                        <span className="truncate font-mono text-xs text-muted-foreground">{node.node_id}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold">{node.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {node.latitude.toFixed(5)}, {node.longitude.toFixed(5)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedNode(node)}>Details</Button>
                  </div>
                ))}
                {!nodes.length && <p className="p-8 text-center text-sm text-muted-foreground">No nodes mapped yet.</p>}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border py-4">
                <CardTitle className="text-base">Fiber cables ({edges.length})</CardTitle>
              </CardHeader>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {edges.map((edge) => (
                      <TableRow key={edge.edge_id}>
                        <TableCell className="font-mono text-sm">{edge.edge_id}</TableCell>
                        <TableCell>{edge.source} → {edge.target}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-6 rounded" style={{ background: getFiberMeta(edge.fiber_type).color }} />
                            {getFiberMeta(edge.fiber_type).label}
                          </span>
                        </TableCell>
                        <TableCell>{edge.distance == null ? '—' : `${edge.distance} m`}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedEdge(edge)}>Details</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!edges.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No fiber cables drawn yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col divide-y divide-border md:hidden">
                {edges.map((edge) => (
                  <div key={edge.edge_id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-4 rounded" style={{ background: getFiberMeta(edge.fiber_type).color }} />
                        <span className="text-xs font-medium">{getFiberMeta(edge.fiber_type).label}</span>
                        <span className="font-mono text-xs text-muted-foreground">{edge.distance == null ? '' : `${edge.distance} m`}</span>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs font-semibold">{edge.edge_id}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{edge.source} → {edge.target}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedEdge(edge)}>Details</Button>
                  </div>
                ))}
                {!edges.length && <p className="p-8 text-center text-sm text-muted-foreground">No fiber cables drawn yet.</p>}
              </div>
            </Card>
          </section>

          {loading && (
            <div className="pointer-events-none absolute right-3 top-3 z-[500] flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 text-xs font-semibold shadow-sm">
              <Spinner className="size-3.5" />
              Loading topology…
            </div>
          )}
        </div>

        {selectedNode && (
          <ModalShell title={selectedNode.name} onClose={() => setSelectedNode(null)}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="metric-label">Node ID</dt><dd className="mt-1 font-mono text-sm">{selectedNode.node_id}</dd></div>
              <div><dt className="metric-label">Type</dt><dd className="mt-1 text-sm">{getTypeLabel(selectedNode.type)}</dd></div>
              <div><dt className="metric-label">Coordinates</dt><dd className="mt-1 font-mono text-sm">{selectedNode.latitude}, {selectedNode.longitude}</dd></div>
              <div><dt className="metric-label">Capacity</dt><dd className="mt-1 text-sm">{selectedNode.capacity ?? '—'}</dd></div>
              <div><dt className="metric-label">Splitter</dt><dd className="mt-1 text-sm">{selectedNode.splitter || '—'}</dd></div>
              <div><dt className="metric-label">PPPoE</dt><dd className="mt-1 text-sm">{selectedNode.pppoe || '—'}</dd></div>
              {selectedNode.notes && <div className="sm:col-span-2"><dt className="metric-label">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{selectedNode.notes}</dd></div>}
            </dl>
            <DialogFooter className="mt-4">
              {isAdmin && (
                <Button variant="outline" onClick={() => { setEditingNode(true); setNodeEditor({ ...selectedNode }); setSelectedNode(null) }}>
                  <Icon name="edit" size={16} />
                  Edit
                </Button>
              )}
              {isAdmin && (
                <Button variant="destructive" onClick={() => setPendingDeleteNode(selectedNode)}>
                  <Icon name="trash" size={16} />
                  Delete
                </Button>
              )}
              <Button onClick={() => setSelectedNode(null)}>Close</Button>
            </DialogFooter>
          </ModalShell>
        )}

        {selectedEdge && (
          <ModalShell title={selectedEdge.edge_id} onClose={() => setSelectedEdge(null)}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="metric-label">Route</dt><dd className="mt-1 text-sm">{selectedEdge.source} → {selectedEdge.target}</dd></div>
              <div><dt className="metric-label">Fiber type</dt><dd className="mt-1 text-sm">{getFiberMeta(selectedEdge.fiber_type).label}</dd></div>
              <div><dt className="metric-label">Distance</dt><dd className="mt-1 text-sm">{selectedEdge.distance == null ? '—' : `${selectedEdge.distance} m`}</dd></div>
              <div><dt className="metric-label">Waypoints</dt><dd className="mt-1 text-sm">{selectedEdge.waypoints?.length || 0}</dd></div>
              {selectedEdge.notes && <div className="sm:col-span-2"><dt className="metric-label">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{selectedEdge.notes}</dd></div>}
            </dl>
            <DialogFooter className="mt-4">
              {isAdmin && (
                <Button variant="outline" onClick={() => { setEditingEdge(true); setEdgeEditor({ ...selectedEdge }); setSelectedEdge(null) }}>
                  <Icon name="edit" size={16} />
                  Edit
                </Button>
              )}
              {isAdmin && (
                <Button variant="destructive" onClick={() => setPendingDeleteEdge(selectedEdge)}>
                  <Icon name="trash" size={16} />
                  Delete
                </Button>
              )}
              <Button onClick={() => setSelectedEdge(null)}>Close</Button>
            </DialogFooter>
          </ModalShell>
        )}

        {selectedLiveDevice && (() => {
          const online = isDeviceOnline(selectedLiveDevice._lastInform)
          const ssids = getDeviceSsids(selectedLiveDevice)
          return (
            <ModalShell
              title={`Live Device · ${selectedLiveDevice.SerialNumber || selectedLiveDevice._id}`}
              onClose={() => setSelectedLiveDevice(null)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <Badge className={online ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30'}>
                    {online ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  Last Inform: {selectedLiveDevice._lastInform ? formatDate(selectedLiveDevice._lastInform) : '—'}
                </span>
              </div>

              <dl className="mt-2 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="metric-label">Serial Number (SN)</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold">
                    <span className="break-all">{selectedLiveDevice.SerialNumber || '—'}</span>
                    {selectedLiveDevice.SerialNumber && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void copyToClipboard(selectedLiveDevice.SerialNumber!).then((ok) => ok && toast.success('SN disalin'))}
                      >
                        Copy
                      </Button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">Device ID</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-mono text-xs">
                    <span className="break-all">{selectedLiveDevice._id}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void copyToClipboard(selectedLiveDevice._id).then((ok) => ok && toast.success('Device ID disalin'))}
                    >
                      Copy
                    </Button>
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">IP TR-069</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm text-primary">
                    <span>{selectedLiveDevice.ipTr069 || '—'}</span>
                    {selectedLiveDevice.ipTr069 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void copyToClipboard(selectedLiveDevice.ipTr069!).then((ok) => ok && toast.success('IP TR-069 disalin'))}
                      >
                        Copy
                      </Button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">PPPoE Username</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm">
                    <span className="break-all">{selectedLiveDevice.pppoe || '—'}</span>
                    {selectedLiveDevice.pppoe && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void copyToClipboard(selectedLiveDevice.pppoe!).then((ok) => ok && toast.success('PPPoE disalin'))}
                      >
                        Copy
                      </Button>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="metric-label">SSID</dt>
                  <dd className="mt-1 break-all font-mono text-sm">{ssids}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="metric-label">Coordinates</dt>
                  <dd className="mt-1 font-mono text-xs text-muted-foreground">
                    {selectedLiveDevice.latitude.toFixed(6)}, {selectedLiveDevice.longitude.toFixed(6)}
                  </dd>
                </div>
              </dl>

              <DialogFooter className="mt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const id = selectedLiveDevice._id
                    setSelectedLiveDevice(null)
                    navigate(`/devices/detail?id=${encodeURIComponent(id)}`)
                  }}
                >
                  <Icon name="external" size={16} />
                  Detail Perangkat
                </Button>
                <Button type="button" onClick={() => setSelectedLiveDevice(null)}>
                  Tutup
                </Button>
              </DialogFooter>
            </ModalShell>
          )
        })()}

        {nodeEditor && <NodeEditor initial={nodeEditor} editing={editingNode} saving={saving} onClose={() => setNodeEditor(null)} onSave={(value) => void saveNode(value)} />}
        {edgeEditor && <EdgeEditor initial={edgeEditor} nodes={nodes} editing={editingEdge} saving={saving} onClose={() => setEdgeEditor(null)} onSave={(value) => void saveEdge(value)} />}

        <AlertDialog open={Boolean(pendingDeleteNode)} onOpenChange={(open) => { if (!open) setPendingDeleteNode(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete node {pendingDeleteNode?.node_id}?</AlertDialogTitle>
              <AlertDialogDescription>
                Every fiber cable connected to this node will also be deleted. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmDeleteNode()}>Delete node</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={Boolean(pendingDeleteEdge)} onOpenChange={(open) => { if (!open) setPendingDeleteEdge(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete cable {pendingDeleteEdge?.edge_id}?</AlertDialogTitle>
              <AlertDialogDescription>
                This fiber route will be permanently removed from the topology map.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmDeleteEdge()}>Delete cable</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

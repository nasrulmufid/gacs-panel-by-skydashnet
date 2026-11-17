'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useToast } from '@/components/ui/toast'
import { useLoading } from '@/components/ui/loading'
import { devicesAPI, mapSettingsAPI } from '@/lib/api'
import { copyToClipboard, formatDate } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from '@/contexts/theme-context'
import 'leaflet/dist/leaflet.css'

const leafletModulePromise = import('leaflet')
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface WanBindingData {
  lan: string[];
  ssid: string[];
}

interface WanConnection {
  index: string;
  connType: string;
  name?: string;
  status?: string;
  ipAddress?: string;
  macAddress?: string;
  vlanId?: any;
  username?: string;
  serviceList?: string;
  connectionType?: string;
  natEnabled?: boolean;
  bindings?: WanBindingData | null;
  editable?: boolean;
  nameConfigurable?: boolean;
  usernameConfigurable?: boolean;
  passwordConfigurable?: boolean;
  vlanConfigurable?: boolean;
  serviceListConfigurable?: boolean;
  connectionTypeConfigurable?: boolean;
  natConfigurable?: boolean;
  bindingsConfigurable?: boolean;
}

interface ProcessedDeviceDetail {
  _id: string;
  _lastInform?: string;
  _lastBoot?: string;
  _registered?: string;
  vendor: string;
  deviceInfo: {
    productclass?: string;
    serialNumber?: string;
    manufacturer?: string;
    oui?: string;
    hardwareVersion?: string;
    softwareVersion?: string;
    upTime?: string;
    macAddress?: string;
  };
  virtualParameters: {
    [key: string]: { path: string; value: any }
  };
  ipTr069?: string | null;
  ipTr069Source?: string | null;
  wifi: WifiNetwork[];
  wan: Array<WanConnection>;
  wanContainers: Array<{ path: string; label: string }>;
  clients: ClientDevice[];
  customer: {
    customerId: string | null;
    installationDate: string | null;
    generated: boolean;
  };
  location?: {
    latitude: number;
    longitude: number;
  } | null;
  remoteAccess?: {
    enabled: boolean;
    baseDomain: string;
    scheme: string;
    authMode: 'none' | 'token';
    subdomain: string | null;
    cleanUrl: string | null;
    targetIp: string | null;
    ipOverride: string | null;
    port: number;
    protocol: 'http' | 'https';
  };
  _raw?: any;
}

interface ClientDevice {
  instance: string;
  dataModel: string;
  hostName?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  interfaceType?: string | null;
  addressSource?: string | null;
  leaseTimeRemaining?: number | null;
  active: boolean | null;
}

interface WifiNetwork {
  index: number;
  enable: boolean | null;
  ssid: string;
  password?: string | null;
  security?: string | null;
  channel?: number | null;
  totalAssociations?: number | null;
  usesVirtualParameters?: boolean;
}

interface WifiFormState {
  enable: boolean;
  ssid: string;
  password: string;
  security: string;
  channel: string;
}

interface WanFormState {
  name: string;
  vlanEnabled: boolean;
  vlanId: string;
  username: string;
  password: string;
  serviceList: string;
  connectionType: string;
  natEnabled: boolean;
  bindings: {
    LAN1: boolean; LAN2: boolean; LAN3: boolean; LAN4: boolean;
    SSID1: boolean; SSID2: boolean; SSID3: boolean; SSID4: boolean;
    SSID5: boolean; SSID6: boolean; SSID7: boolean; SSID8: boolean;
  };
}

function EditWanModal({
  isOpen,
  onClose,
  wanData,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  wanData: WanConnection | null;
  onSave: (formData: WanFormState) => void;
}) {
  const [wanForm, setWanForm] = useState<WanFormState>({
    name: '',
    vlanEnabled: false,
    vlanId: '',
    username: '',
    password: '',
    serviceList: '',
    connectionType: 'IP_Routed',
    natEnabled: false,
    bindings: {
      LAN1: false, LAN2: false, LAN3: false, LAN4: false,
      SSID1: false, SSID2: false, SSID3: false, SSID4: false,
      SSID5: false, SSID6: false, SSID7: false, SSID8: false,
    }
  });

  const [isVlanConfigurable, setIsVlanConfigurable] = useState(false);

  useEffect(() => {
    if (wanData) {
      const isVlanSet = wanData.vlanId !== null && wanData.vlanId !== undefined;
      setIsVlanConfigurable(Boolean(wanData.vlanConfigurable));

      const newBindings: WanFormState['bindings'] = {
        LAN1: false, LAN2: false, LAN3: false, LAN4: false,
        SSID1: false, SSID2: false, SSID3: false, SSID4: false,
        SSID5: false, SSID6: false, SSID7: false, SSID8: false,
      };
      wanData.bindings?.lan.forEach(lan => {
        if (lan in newBindings) newBindings[lan as keyof typeof newBindings] = true;
      });
      wanData.bindings?.ssid.forEach(ssid => {
        if (ssid in newBindings) newBindings[ssid as keyof typeof newBindings] = true;
      });

      setWanForm({
        name: wanData.name || '',
        vlanEnabled: isVlanSet,
        vlanId: isVlanSet ? String(wanData.vlanId) : '',
        username: wanData.username || '',
        password: '',
        serviceList: wanData.serviceList || '',
        connectionType: wanData.connectionType || 'IP_Routed',
        natEnabled: Boolean(wanData.natEnabled),
        bindings: newBindings
      });
    }
  }, [wanData]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setWanForm(prev => ({
      ...prev,
      bindings: {
        ...prev.bindings,
        [name]: checked
      }
    }));
  };

  const handleSaveClick = () => {
    onSave(wanForm);
  };

  if (!isOpen || !wanData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Edit WAN Connection</DialogTitle>
        </DialogHeader>

        {/* Form Body */}
        <div className="space-y-6 overflow-y-auto p-6">
          {/* 1. WAN Name */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">WAN Name</label>
            <input
              type="text"
              value={wanForm.name}
              maxLength={256}
              disabled={!wanData.nameConfigurable}
              onChange={(event) => setWanForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={wanData.nameConfigurable ? 'Enter WAN connection name' : 'Name parameter is not writable'}
              className="modern-input w-full"
            />
          </div>

          {/* 2. VLAN */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">VLAN</label>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="vlanEnabled"
                checked={wanForm.vlanEnabled}
                onChange={(e) => setWanForm(f => ({ ...f, vlanEnabled: e.target.checked }))}
                disabled={!isVlanConfigurable}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
              />
              <label
                htmlFor="vlanEnabled"
                className={`text-sm ${!isVlanConfigurable ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : ''}`}
              >
                Enable VLAN
              </label>
            </div>
            <input
              type="number"
              min={1}
              max={4094}
              value={wanForm.vlanId}
              onChange={(e) => setWanForm(f => ({ ...f, vlanId: e.target.value }))}
              disabled={!wanForm.vlanEnabled}
              placeholder={!isVlanConfigurable ? 'VLAN Not Available' : (wanForm.vlanEnabled ? 'Enter VLAN ID (1-4094)' : 'VLAN Not Enabled')}
              className="modern-input w-full mt-2"
            />
          </div>

          {/* 3. PPP Username */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">PPP Username</label>
            <input
              type="text"
              value={wanForm.username}
              disabled={!wanData.usernameConfigurable}
              onChange={(e) => setWanForm(f => ({ ...f, username: e.target.value }))}
              placeholder={wanData.usernameConfigurable ? 'Enter PPPoE username' : 'Username parameter is not writable'}
              className="modern-input w-full font-mono"
            />
          </div>

          {/* 4. PPP Password */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">PPP Password</label>
            <input
              type="password"
              value={wanForm.password}
              disabled={!wanData.passwordConfigurable}
              onChange={(e) => setWanForm(f => ({ ...f, password: e.target.value }))}
              placeholder={wanData.passwordConfigurable ? 'Enter new password (leave blank to keep unchanged)' : 'Password parameter is not writable'}
              className="modern-input w-full font-mono"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Service list</label>
              <input
                type="text"
                value={wanForm.serviceList}
                maxLength={128}
                disabled={!wanData.serviceListConfigurable}
                onChange={(event) => setWanForm((current) => ({ ...current, serviceList: event.target.value }))}
                placeholder={wanData.serviceListConfigurable ? 'INTERNET' : 'Service parameter is not writable'}
                className="modern-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Connection mode</label>
              <select
                value={wanForm.connectionType}
                disabled={!wanData.connectionTypeConfigurable}
                onChange={(event) => setWanForm((current) => ({ ...current, connectionType: event.target.value }))}
                className="modern-input w-full"
              >
                <option value="IP_Routed">Routed</option>
                <option value="PPPoE_Bridged">Bridged</option>
              </select>
            </div>
          </div>

          <label className={`flex items-center gap-3 rounded-md border border-border p-3 ${wanData.natConfigurable ? 'cursor-pointer' : 'opacity-60'}`}>
            <input
              type="checkbox"
              checked={wanForm.natEnabled}
              disabled={!wanData.natConfigurable}
              onChange={(event) => setWanForm((current) => ({ ...current, natEnabled: event.target.checked }))}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            <span>
              <span className="block text-sm font-semibold">Enable NAT</span>
              <span className="block text-xs text-muted-foreground">
                {wanData.natConfigurable ? 'Apply NAT on this routed WAN.' : 'NAT parameter is not writable on this connection.'}
              </span>
            </span>
          </label>

          {/* 5. Interface Binding */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Interface Binding</label>
            {!wanData.bindingsConfigurable && (
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                This ONT did not report writable interface-binding parameters.
              </p>
            )}
            <div className="space-y-4">
              {/* LAN */}
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">LAN Ports</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([1, 2, 3, 4] as const).map(i => (
                    <label key={`lan-${i}`} className="flex items-center space-x-2 p-2 border dark:border-gray-700 rounded-md">
                      <input
                        type="checkbox"
                        name={`LAN${i}`}
                        checked={wanForm.bindings[`LAN${i}`]}
                        onChange={handleCheckboxChange}
                        disabled={!wanData.bindingsConfigurable}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">LAN{i}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* WiFi */}
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">WiFi Networks</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([1, 2, 3, 4, 5, 6, 7, 8] as const).map(i => (
                    <label key={`ssid-${i}`} className="flex items-center space-x-2 p-2 border dark:border-gray-700 rounded-md">
                      <input
                        type="checkbox"
                        name={`SSID${i}`}
                        checked={wanForm.bindings[`SSID${i}`]}
                        onChange={handleCheckboxChange}
                        disabled={!wanData.bindingsConfigurable}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">SSID{i}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveClick}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditCredentialModal({
  isOpen,
  onClose,
  credentialType,
  username,
  onSave
} : {
  isOpen: boolean;
  onClose: () => void;
  credentialType: 'super' | 'user' | null;
  username: string;
  onSave: (type: 'super' | 'user', password: string) => void;
}) {
  const [password, setPassword] = useState('');

  const handleSaveClick = () => {
    if (credentialType && password) {
      onSave(credentialType, password);
      setPassword('');
    }
  };

  const title = credentialType === 'super' ? 'Superadmin (ISP)' : 'Useradmin (Client)';

  if (!isOpen || !credentialType) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update {title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Username</Label>
            <Input
              type="text"
              value={username || 'N/A'}
              readOnly
              className="cursor-not-allowed bg-muted"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>New Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveClick} disabled={!password}>
            Save Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditWifiModal({
  wifi,
  onClose,
  onSave,
  saving
}: {
  wifi: WifiNetwork | null;
  onClose: () => void;
  onSave: (form: WifiFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<WifiFormState>({
    enable: true,
    ssid: '',
    password: '',
    security: '',
    channel: ''
  })

  useEffect(() => {
    if (!wifi) return
    setForm({
      enable: wifi.enable !== false,
      ssid: wifi.ssid || '',
      password: '',
      security: wifi.security || '',
      channel: wifi.channel === null || wifi.channel === undefined ? '' : String(wifi.channel)
    })
  }, [wifi])

  if (!wifi) return null

  return (
    <Dialog open={Boolean(wifi)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Edit WiFi SSID {wifi.index}</DialogTitle>
          <DialogDescription>
            {wifi.usesVirtualParameters ? 'Using genieacs-installer virtual parameters.' : 'Using the device TR-098 WLAN path.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-y-auto p-6">
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
            <span>
              <span className="block text-sm font-semibold">Radio enabled</span>
              <span className="block text-xs text-muted-foreground">Applied only when the CPE exposes the Enable parameter.</span>
            </span>
            <Switch
              checked={form.enable}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, enable: checked }))}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wifi-ssid">Network name (SSID)</Label>
            <Input
              id="wifi-ssid"
              maxLength={32}
              value={form.ssid}
              onChange={(event) => setForm((current) => ({ ...current, ssid: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{form.ssid.length}/32 characters</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wifi-password">New password</Label>
            <Input
              id="wifi-password"
              type="password"
              className="font-mono"
              minLength={8}
              maxLength={63}
              value={form.password}
              placeholder="Leave blank to keep the existing password"
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">WPA/WPA2 passphrases require 8–63 characters.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wifi-security">Beacon/security type</Label>
            <Input
              id="wifi-security"
              list="wifi-security-options"
              value={form.security}
              onChange={(event) => setForm((current) => ({ ...current, security: event.target.value }))}
            />
            <datalist id="wifi-security-options">
              <option value="None" />
              <option value="Basic" />
              <option value="WPA" />
              <option value="11i" />
              <option value="WPAand11i" />
            </datalist>
            <p className="text-xs text-muted-foreground">The exact accepted value depends on the CPE firmware.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wifi-channel">Channel</Label>
            <Input
              id="wifi-channel"
              type="number"
              min={0}
              max={196}
              value={form.channel}
              placeholder="0 for automatic when supported"
              onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}
            />
          </div>
          <Alert>
            <Icon name="warning" size={16} />
            <AlertDescription className="text-xs">
              Updating the SSID, password, or security mode can disconnect every client currently using this network.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(form)} disabled={saving || !form.ssid.trim()}>
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? 'Queuing task…' : 'Apply WiFi changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getPickerTileConfig(basemap: 'osm' | 'google', dark: boolean) {
  if (basemap === 'google') {
    return {
      url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=id&gl=id',
      attribution: 'Map data &copy; Google'
    }
  }
  if (dark) {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  }
}

function DeviceMapLocationCard({
  device,
  isAdmin,
  onLocationSaved,
  onOpenNetworkMap,
}: {
  device: ProcessedDeviceDetail
  isAdmin: boolean
  onLocationSaved: (location: { latitude: number; longitude: number } | null) => void
  onOpenNetworkMap: () => void
}) {
  const { isDarkMode } = useTheme()
  const toast = useToast()

  const [basemap, setBasemap] = useState<'osm' | 'google'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('networkMapBasemap') : null
    return saved === 'google' ? 'google' : 'osm'
  })
  const [mapCenter, setMapCenter] = useState<[number, number]>(() =>
    device.location ? [device.location.latitude, device.location.longitude] : [-6.2088, 106.8456]
  )
  const [defaultZoom, setDefaultZoom] = useState(() => (device.location ? 16 : 13))
  const [minZoom, setMinZoom] = useState(5)
  const [maxZoom, setMaxZoom] = useState(18)
  const [draftLocation, setDraftLocation] = useState<{ latitude: number; longitude: number } | null>(
    device.location || null
  )
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const initialLocationRef = useRef(device.location || null)
  const isAdminRef = useRef(isAdmin)

  useEffect(() => {
    isAdminRef.current = isAdmin
  }, [isAdmin])

  useEffect(() => {
    setDraftLocation(device.location || null)
    initialLocationRef.current = device.location || null
  }, [device._id, device.location])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await mapSettingsAPI.get()
        if (cancelled || !res.success || !res.data) return
        const s = res.data as any
        const nextMin = Number.isFinite(Number(s.max_zoom_out)) ? Number(s.max_zoom_out) : 5
        const nextMax = Number.isFinite(Number(s.max_zoom_in)) ? Number(s.max_zoom_in) : 18
        const nextZoom = Number.isFinite(Number(s.default_zoom)) ? Number(s.default_zoom) : 13
        setMinZoom(nextMin)
        setMaxZoom(nextMax)
        if (!initialLocationRef.current) {
          const lat = Number(s.center_lat)
          const lng = Number(s.center_lng)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setMapCenter([lat, lng])
            setDefaultZoom(nextZoom)
            mapRef.current?.setView([lat, lng], nextZoom)
          }
        }
      } catch {
        // Default center remains active when map settings cannot be loaded.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const updateTileLayer = useCallback(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    const tile = getPickerTileConfig(basemap, isDarkMode)
    tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution }).addTo(map)
  }, [basemap, isDarkMode])

  const syncMarker = useCallback((loc: { latitude: number; longitude: number } | null) => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return

    if (!loc) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current)
        markerRef.current = null
      }
      return
    }

    const iconHtml = `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#0ea5e9;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,.35);color:#ffffff"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.33-6-10a6 6 0 1 1 12 0c0 4.67-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg></div>`
    const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [32, 32], iconAnchor: [16, 32] })

    if (markerRef.current) {
      markerRef.current.setLatLng([loc.latitude, loc.longitude])
      markerRef.current.setIcon(icon)
    } else {
      const marker = L.marker([loc.latitude, loc.longitude], {
        icon,
        draggable: isAdminRef.current,
      }).addTo(map)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        setDraftLocation({
          latitude: Number(pos.lat.toFixed(6)),
          longitude: Number(pos.lng.toFixed(6)),
        })
      })
      markerRef.current = marker
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!leafletRef.current) {
        const module = await leafletModulePromise
        leafletRef.current = (module as any).default ?? module
      }
      if (cancelled || !mapContainerRef.current) return
      const L = leafletRef.current
      if (!mapRef.current) {
        const initialCenter: [number, number] = initialLocationRef.current
          ? [initialLocationRef.current.latitude, initialLocationRef.current.longitude]
          : mapCenter
        const initialZoom = initialLocationRef.current ? Math.min(maxZoom, 16) : defaultZoom
        const map = L.map(mapContainerRef.current, {
          center: initialCenter,
          zoom: initialZoom,
          minZoom,
          maxZoom,
        })
        map.on('click', (event: any) => {
          if (!isAdminRef.current) return
          const { lat, lng } = event.latlng
          setDraftLocation({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
          })
        })
        mapRef.current = map
        updateTileLayer()
        syncMarker(initialLocationRef.current)
        window.setTimeout(() => mapRef.current?.invalidateSize(), 100)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setMinZoom(minZoom)
    mapRef.current.setMaxZoom(maxZoom)
  }, [minZoom, maxZoom])

  useEffect(() => {
    if (mapRef.current) updateTileLayer()
  }, [updateTileLayer])

  useEffect(() => {
    if (mapRef.current) syncMarker(draftLocation)
  }, [draftLocation, syncMarker])

  useEffect(() => () => {
    mapRef.current?.remove()
    mapRef.current = null
    markerRef.current = null
    tileLayerRef.current = null
  }, [])

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung geolokasi GPS')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }
        setDraftLocation(next)
        mapRef.current?.setView([next.latitude, next.longitude], Math.min(maxZoom, 17))
        setLocating(false)
      },
      (err) => {
        toast.error(`Gagal mengambil lokasi GPS: ${err.message}`)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleConfirmSave = async () => {
    if (!draftLocation) return
    setConfirmSaveOpen(false)
    setSaving(true)
    try {
      const res = await devicesAPI.updateLocation(device._id, draftLocation)
      if (!res.success) {
        toast.error(res.message || 'Gagal menyimpan lokasi perangkat')
        return
      }
      const saved = res.data?.location || draftLocation
      onLocationSaved(saved)
      toast.success(res.message || 'Lokasi perangkat berhasil disimpan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan lokasi perangkat')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    setConfirmDeleteOpen(false)
    setSaving(true)
    try {
      const res = await devicesAPI.updateLocation(device._id, { latitude: null, longitude: null })
      if (!res.success) {
        toast.error(res.message || 'Gagal menghapus lokasi perangkat')
        return
      }
      setDraftLocation(null)
      onLocationSaved(null)
      toast.success(res.message || 'Lokasi perangkat dihapus')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus lokasi perangkat')
    } finally {
      setSaving(false)
    }
  }

  const hasUnsavedChange = Boolean(
    draftLocation &&
    (!device.location ||
      Math.abs(draftLocation.latitude - device.location.latitude) > 1e-6 ||
      Math.abs(draftLocation.longitude - device.location.longitude) > 1e-6)
  )

  return (
    <div className="modern-card p-5 sm:p-6 lg:col-span-2">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Map Location</h2>
            {device.location ? (
              <Badge variant="secondary" className="font-mono text-xs">
                Pinned · {device.location.latitude.toFixed(6)}, {device.location.longitude.toFixed(6)}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Belum ditandai</Badge>
            )}
            {hasUnsavedChange && (
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Belum disimpan
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin
              ? 'Klik titik pada peta (atau geser pin) untuk menandai lokasi perangkat, lalu konfirmasi dan simpan agar tampil di Network Map.'
              : 'Lokasi koordinat perangkat yang tercatat pada peta jaringan.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={basemap}
            onValueChange={(value) => {
              const next = value as 'osm' | 'google'
              setBasemap(next)
              localStorage.setItem('networkMapBasemap', next)
            }}
          >
            <TabsList>
              <TabsTrigger value="osm">OSM</TabsTrigger>
              <TabsTrigger value="google">Google</TabsTrigger>
            </TabsList>
          </Tabs>
          {device.location && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenNetworkMap}>
              <Icon name="map" size={16} />
              Lihat di Map
            </Button>
          )}
        </div>
      </div>

      <div className="relative h-72 w-full overflow-hidden rounded-md border border-border sm:h-80">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md flex-1">
          <div>
            <Label htmlFor="device-lat" className="text-xs text-muted-foreground">Latitude</Label>
            <Input
              id="device-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              readOnly={!isAdmin}
              className="mt-1 font-mono text-sm"
              placeholder="-6.208800"
              value={draftLocation ? String(draftLocation.latitude) : ''}
              onChange={(e) => {
                if (e.target.value.trim() === '') return
                const val = Number(e.target.value)
                if (!Number.isFinite(val) || val < -90 || val > 90) return
                setDraftLocation((prev) => ({
                  latitude: val,
                  longitude: prev?.longitude ?? mapCenter[1],
                }))
              }}
            />
          </div>
          <div>
            <Label htmlFor="device-lng" className="text-xs text-muted-foreground">Longitude</Label>
            <Input
              id="device-lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              readOnly={!isAdmin}
              className="mt-1 font-mono text-sm"
              placeholder="106.845600"
              value={draftLocation ? String(draftLocation.longitude) : ''}
              onChange={(e) => {
                if (e.target.value.trim() === '') return
                const val = Number(e.target.value)
                if (!Number.isFinite(val) || val < -180 || val > 180) return
                setDraftLocation((prev) => ({
                  latitude: prev?.latitude ?? mapCenter[0],
                  longitude: val,
                }))
              }}
            />
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={locating || saving}
              onClick={handleUseCurrentGps}
            >
              {locating ? <Spinner data-icon="inline-start" /> : <Icon name="pin" size={16} />}
              {locating ? 'Mencari GPS…' : 'Gunakan GPS'}
            </Button>
            {device.location && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Icon name="trash" size={16} />
                Hapus Titik
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={saving || !draftLocation}
              onClick={() => setConfirmSaveOpen(true)}
            >
              {saving ? <Spinner data-icon="inline-start" /> : <Icon name="check" size={16} />}
              {saving ? 'Menyimpan…' : 'Konfirmasi & Simpan Lokasi'}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Titik Lokasi Perangkat</AlertDialogTitle>
            <AlertDialogDescription>
              Pastikan titik pin pada peta untuk perangkat{' '}
              <strong className="font-mono text-foreground">
                {device.deviceInfo?.serialNumber || device._id}
              </strong>{' '}
              sudah tepat di koordinat{' '}
              <strong className="font-mono text-foreground">
                {draftLocation?.latitude.toFixed(6)}, {draftLocation?.longitude.toFixed(6)}
              </strong>{' '}
              sebelum disimpan ke Network Map?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Periksa Lagi</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmSave()}>
              Ya, Titik Sudah Tepat &amp; Simpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Titik Lokasi Perangkat?</AlertDialogTitle>
            <AlertDialogDescription>
              Titik perangkat{' '}
              <strong className="font-mono text-foreground">
                {device.deviceInfo?.serialNumber || device._id}
              </strong>{' '}
              akan dihapus dari peta live device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>
              Hapus Titik
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


export default function DeviceDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const deviceId = searchParams.get('id') || ''
  const [device, setDevice] = useState<ProcessedDeviceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [rebootConfirmOpen, setRebootConfirmOpen] = useState(false)
  const [remoteModalOpen, setRemoteModalOpen] = useState(false)
  const [remoteIpOverride, setRemoteIpOverride] = useState('')
  const [remotePort, setRemotePort] = useState('80')
  const [remoteProtocol, setRemoteProtocol] = useState<'http' | 'https'>('http')
  const [launchingRemote, setLaunchingRemote] = useState(false)
  const [rebooting, setRebooting] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const loadingCtl = useLoading()
  const [isWanModalOpen, setIsWanModalOpen] = useState(false)
  const [editingWan, setEditingWan] = useState<WanConnection | null>(null)
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false)
  const [credentialType, setCredentialType] = useState<'super' | 'user' | null>(null);
  const [editingWifi, setEditingWifi] = useState<WifiNetwork | null>(null)
  const [savingWifi, setSavingWifi] = useState(false)
  const [installationDate, setInstallationDate] = useState('')
  const [savingInstallationDate, setSavingInstallationDate] = useState(false)
  const [wanContainer, setWanContainer] = useState('')
  const [newWanType, setNewWanType] = useState<'ppp' | 'ip'>('ppp')
  const [addingWan, setAddingWan] = useState(false)


  const handleOpenEditModal = (wan: WanConnection) => {
    setEditingWan(wan);
    setIsWanModalOpen(true);
  }

  const handleCloseWanModal = () => {
    setIsWanModalOpen(false);
    setEditingWan(null);
  }

  const handleSaveWan = async (formData: WanFormState) => {
    if (!editingWan) return;
    if (formData.vlanEnabled) {
      const vlanId = Number(formData.vlanId)
      if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
        toast.error('VLAN ID must be between 1 and 4094')
        return
      }
    }

    loadingCtl.show('Saving WAN changes...');
    try {
      const res = await devicesAPI.updateWanConfig(deviceId, editingWan.index, formData);

      if (res.success) {
        toast.success(res.message || 'WAN config updated!');
        handleCloseWanModal();

        setTimeout(() => {
          fetchDeviceDetails(true);
        }, 1500);

      } else {
        toast.error(res.message || 'Failed to update WAN config');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save WAN config');
    } finally {
      loadingCtl.hide();
    }
  }

  const handleOpenCredentialModal = (type: 'super' | 'user') => {
    setCredentialType(type);
    setIsCredentialModalOpen(true);
  }

  const handleCloseCredentialModal = () => {
    setIsCredentialModalOpen(false);
    setCredentialType(null);
  }

  const handleSaveCredentials = async (type: 'super' | 'user', password: string) => {
    loadingCtl.show('Updating credentials...');
    try {
      const res = await devicesAPI.updateCredentials(deviceId, type, password);

      if (res.success) {
        toast.success(res.message || 'Credentials update task queued!');
        handleCloseCredentialModal();
        setTimeout(() => {
          fetchDeviceDetails(true);
        }, 1500);
      } else {
        toast.error(res.message || 'Failed to update credentials');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update credentials');
    } finally {
      loadingCtl.hide();
    }
  }

  const handleSaveWifi = async (formData: WifiFormState) => {
    if (!editingWifi) return
    if (formData.password && (formData.password.length < 8 || formData.password.length > 63)) {
      toast.error('WiFi password must contain 8 to 63 characters')
      return
    }
    setSavingWifi(true)
    loadingCtl.show(`Queuing WiFi SSID ${editingWifi.index} update…`)
    try {
      const res = await devicesAPI.updateWifiConfig(deviceId, editingWifi.index, formData)
      if (!res.success) {
        toast.error(res.message || 'Failed to update WiFi configuration')
        return
      }
      setDevice((current) => current ? {
        ...current,
        wifi: current.wifi.map((network) => network.index === editingWifi.index ? {
          ...network,
          enable: formData.enable,
          ssid: formData.ssid,
          security: formData.security || network.security,
          channel: formData.channel === '' ? network.channel : Number(formData.channel)
        } : network)
      } : current)
      toast.success(res.message || 'WiFi update task queued')
      setEditingWifi(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update WiFi configuration')
    } finally {
      setSavingWifi(false)
      loadingCtl.hide()
    }
  }

  const fetchDeviceDetails = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    }

    try {
      if (!deviceId) {
        setDevice(null)
        return
      }
      const res = await devicesAPI.getDevice(deviceId)
      if (res.success && res.data) {
        const nextDevice = res.data as ProcessedDeviceDetail
        setDevice(nextDevice)
        setInstallationDate(nextDevice.customer?.installationDate || '')
        setWanContainer((current) => current || nextDevice.wanContainers?.[0]?.path || '')
      } else {
        toast.error(res.message || 'Failed to load device details')
        setDevice(null)
      }
    } catch (error) {
      console.error('Error fetching device details:', error)
      toast.error('Network error fetching device details')
    } finally {
      setLoading(false);
    }
  }, [deviceId, toast])

  const handleSaveInstallationDate = async () => {
    if (!installationDate) {
      toast.error('Select an installation date first')
      return
    }
    setSavingInstallationDate(true)
    try {
      const res = await devicesAPI.updateInstallationDate(deviceId, installationDate)
      if (!res.success) {
        toast.error(res.message || 'Failed to save installation date')
        return
      }
      const result = res.data as { customerId?: string | null; installationDate?: string }
      setDevice((current) => current ? {
        ...current,
        customer: {
          customerId: result.customerId ?? current.customer?.customerId ?? null,
          installationDate: result.installationDate || installationDate,
          generated: Boolean(result.customerId ?? current.customer?.customerId)
        }
      } : current)
      toast.success(res.message || 'Installation date saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save installation date')
    } finally {
      setSavingInstallationDate(false)
    }
  }

  const handleAddWan = async () => {
    if (!wanContainer) {
      toast.error('This device did not report a WAN connection container')
      return
    }
    setAddingWan(true)
    try {
      const res = await devicesAPI.addWanConnection(deviceId, wanContainer, newWanType)
      if (!res.success) {
        toast.error(res.message || 'Failed to add WAN connection')
        return
      }
      toast.success(res.message || 'WAN creation task queued')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add WAN connection')
    } finally {
      setAddingWan(false)
    }
  }

  useEffect(() => {
    fetchDeviceDetails(false);
  }, [fetchDeviceDetails]);

  useEffect(() => {
    if (!device?.remoteAccess) return
    setRemoteIpOverride(device.remoteAccess.ipOverride || '')
    setRemotePort(String(device.remoteAccess.port || 80))
    setRemoteProtocol(device.remoteAccess.protocol || 'http')
  }, [device?.remoteAccess])

  const handleLaunchRemote = async (savePreference = false, openWindow = true) => {
    if (!device) return
    setLaunchingRemote(true)
    try {
      const res = await devicesAPI.prepareRemoteSession(device._id, {
        targetIp: remoteIpOverride.trim() || null,
        port: Number(remotePort) || 80,
        protocol: remoteProtocol,
        savePreference,
      })
      if (!res.success || !res.data) {
        toast.error(res.message || 'Could not prepare remote session')
        return
      }
      if (savePreference) {
        toast.success('Konfigurasi remote perangkat disimpan')
        void fetchDeviceDetails(false)
      }
      if (openWindow && res.data.url) {
        if (!res.data.enabled) {
          toast.warning('Remote Device Proxy belum diaktifkan di Settings → Panel & ACS.')
        }
        window.open(res.data.url, '_blank', 'noopener,noreferrer')
        setRemoteModalOpen(false)
      }
    } catch {
      toast.error('Failed to prepare remote session')
    } finally {
      setLaunchingRemote(false)
    }
  }

  const handleReboot = () => {
    setRebootConfirmOpen(true)
  }

  const executeReboot = async () => {
    setRebootConfirmOpen(false)
    setRebooting(true)
    loadingCtl.show('Sending reboot command...')
    try {
      const res = await devicesAPI.rebootDevice(deviceId)
      if (res.success) {
        toast.success('Device reboot command sent successfully!')
      } else {
        toast.error(res.message || 'Failed to send reboot command')
      }
    } catch {
      toast.error('Error sending reboot command')
    } finally {
      setRebooting(false)
      loadingCtl.hide()
    }
  }

  const handleSummon = async () => {
    loadingCtl.show('Summoning device...')
    try {
      const res = await devicesAPI.summonDevice(deviceId)
      if (res.success) {
        toast.success(res.message || 'Summon command sent!')
      } else {
        toast.error(res.message || 'Failed to send summon')
      }
    } catch {
      toast.error('Error sending summon command')
    } finally {
      loadingCtl.hide()
    }
  }

  const getSignalStrengthInfo = (rxPowerStr: string | number | null | undefined) => {
    const rxpower = parseFloat(String(rxPowerStr));

    if (isNaN(rxpower)) {
      return {
        color: 'text-gray-500 dark:text-gray-400',
        label: 'N/A',
        badgeClass: 'modern-badge'
      };
    }

    if (rxpower >= -21.99) {
      return {
        color: 'text-green-600 dark:text-green-400',
        label: 'Excellent',
        badgeClass: 'modern-badge-success'
      };
    }
    if (rxpower >= -24.99) {
      return {
        color: 'text-blue-600 dark:text-blue-400',
        label: 'Good',
        badgeClass: 'modern-badge-info'
      };
    }
    if (rxpower >= -26.99) {
      return {
        color: 'text-yellow-600 dark:text-yellow-400',
        label: 'Poor',
        badgeClass: 'modern-badge-warning'
      };
    }
    return {
      color: 'text-red-600 dark:text-red-400',
      label: 'Danger',
      badgeClass: 'modern-badge-error'
    };
  }

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return <span className="modern-badge">Unknown</span>

    if (status.includes(':') || status.includes('Z')) {
       try {
         const lastSeen = new Date(status)
         if (Number.isNaN(lastSeen.getTime())) {
           return <span className="modern-badge">Invalid Date</span>
         }
         const now = new Date()
         const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60))

         if (diffMinutes < 10) {
           return <span className="modern-badge-success">Online</span>
         } else if (diffMinutes < 60) {
           return <span className="modern-badge-warning">Away</span>
         } else {
           return <span className="modern-badge-error">Offline</span>
         }
       } catch {
          return <span className="modern-badge">Invalid Date</span>
       }
    }

    switch (status.toLowerCase()) {
      case 'connected':
        return <span className="modern-badge-success">Connected</span>
      case 'disconnected':
        return <span className="modern-badge-error">Disconnected</span>
      case 'connecting':
        return <span className="modern-badge-warning">Connecting</span>
      case 'idle':
        return <span className="modern-badge-warning">Idle</span>
      default:
        return <span className="modern-badge">{status}</span>
    }
  }

  const renderBindingBox = (label: string, isBound: boolean) => (
    <div className={`
      relative flex flex-col items-center justify-center p-2 rounded-md
      transition-all duration-200 ease-in-out
      ${isBound
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
      }
    `}>
      {isBound && (
        <svg className="w-6 h-6 text-blue-500 dark:text-blue-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      )}
      {!isBound && (
         <div className="w-6 h-6 mb-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
           </svg>
         </div>
      )}
      <span className="text-xs font-semibold">{label}</span>
    </div>
  )

  if (loading) {
    return (
      <div className="page-shell">
        <div className="page-frame">
          <div className="mb-5 h-28 animate-pulse rounded-md bg-muted" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 animate-pulse rounded-md bg-muted" />
            <div className="h-64 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page-shell">
        <div className="page-frame">
          <div className="modern-card empty-state">
            <div className="empty-state-icon"><Icon name="server" size={22} /></div>
            <h2 className="empty-state-title">Device could not be opened</h2>
            <p className="empty-state-copy">Perangkat mungkin sudah dihapus atau GenieACS tidak mengembalikan detailnya. Kembali ke inventory lalu cari ulang serial perangkat.</p>
            <button
              onClick={() => navigate('/devices')} className="modern-button mt-5"
            >
              Back to inventory
            </button>
          </div>
        </div>
      </div>
    )
  }

  const vp = device.virtualParameters || {}
  const deviceInfo = device.deviceInfo || {}
  const primaryWAN = (device.wan && device.wan.length > 0) ? device.wan[0] : null
  const signalInfo = getSignalStrengthInfo(vp.rxpower?.value);

  return (
    <div className="page-shell">
      <div className="page-frame">
        <header className="page-header">
          <div>
            <div className="mb-3">
              <button
                onClick={() => navigate('/devices')}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <Icon name="back" size={17} /> Device inventory
              </button>
            </div>
            <p className="page-kicker">Managed endpoint</p>
            <h1 className="page-title break-all">
              {deviceInfo.serialNumber || device._id}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {getStatusBadge(device._lastInform)}
              <span className="text-xs text-muted-foreground">
                Last Inform {formatDate(device._lastInform)}
              </span>
              <span className="max-w-full truncate font-mono text-[0.68rem] text-muted-foreground">{device._id}</span>
              <span className={device.customer?.customerId ? 'modern-badge-info font-mono' : 'modern-badge'}>
                {device.customer?.customerId || 'Customer ID not generated'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoteModalOpen(true)}
            >
              <Icon name="globe" size={16} />
              Remote Web
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReboot}
              disabled={rebooting}
            >
              <Icon name="power" size={16} />
              {rebooting ? 'Rebooting…' : 'Reboot device'}
            </Button>
            <Button
              type="button"
              onClick={handleSummon}
              title="Summon Device"
            >
              <Icon name="bell" size={16} /> Request Inform
            </Button>
          </div>
        </header>

        {/* Device Info Cards */}
        <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-[var(--radius)] border border-border bg-card lg:grid-cols-4">
          <div className="border-b border-r border-border p-4 lg:border-b-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Signal Strength</span>
              <span className={signalInfo.badgeClass}>{signalInfo.label}</span>
            </div>
            <div className={`text-2xl font-bold ${signalInfo.color}`}>
              {vp.rxpower?.value !== null && vp.rxpower?.value !== undefined ? `${vp.rxpower.value} dBm` : 'N/A'}
            </div>
          </div>
          <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Temperature</span>
              <Icon name="thermometer" size={20} className="text-gray-400 dark:text-gray-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {vp.temperature?.value ?? 'N/A'}
            </div>
          </div>
          <div className="border-r border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Devices</span>
              <Icon name="phone" size={20} className="text-gray-400 dark:text-gray-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {vp.activedevices?.value || 0}
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Model</span>
              <Icon name="server" size={20} className="text-gray-400 dark:text-gray-500" />
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {deviceInfo.productclass || 'N/A'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="wan">WAN</TabsTrigger>
              <TabsTrigger value="wifi">WiFi</TabsTrigger>
              <TabsTrigger value="clients">Clients ({device.clients?.length || 0})</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {/* Tab Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="modern-card p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Device Information</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Device ID:</span>
                  <span className="font-mono text-sm">{device._id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Serial Number:</span>
                  <span className="font-mono text-sm">{deviceInfo.serialNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">IP TR-069:</span>
                  <span className="font-mono text-sm font-semibold text-primary">
                    {device.remoteAccess?.targetIp || device.ipTr069 || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Manufacturer:</span>
                  <span>{deviceInfo.manufacturer || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Product Class:</span>
                  <span>{deviceInfo.productclass || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Hardware Version:</span>
                  <span>{deviceInfo.hardwareVersion || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Software Version:</span>
                  <span>{deviceInfo.softwareVersion || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Last Boot:</span>
                  <span>{formatDate(device._lastBoot)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Last Registered:</span>
                  <span>{formatDate(device._registered)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="modern-card p-5 sm:p-6">
                <p className="page-kicker">Customer access</p>
                <h2 className="section-heading">Customer ID</h2>
                <p className="mt-3 break-all font-mono text-lg font-bold">
                  {device.customer?.customerId || 'Not generated'}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  This ID is permanent after generation and remains bound to SoftwareID plus PPPoE username.
                </p>
                <div className="mt-5 border-t border-border pt-4">
                  <label htmlFor="installation-date" className="field-label">Installation date</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="installation-date"
                      type="date"
                      className="modern-input"
                      value={installationDate}
                      onChange={(event) => setInstallationDate(event.target.value)}
                    />
                    <button
                      type="button"
                      className="modern-button shrink-0"
                      disabled={savingInstallationDate}
                      onClick={() => void handleSaveInstallationDate()}
                    >
                      {savingInstallationDate ? 'Saving…' : 'Save date'}
                    </button>
                  </div>
                  <p className="field-hint">Saved in SkyGenPanel and synchronized to GenieACS as an installation tag.</p>
                </div>
              </div>

              <div className="modern-card p-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Signal Information</h2>
                <div className="space-y-3">
                   <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">RX Power:</span>
                      <span className={`font-medium ${signalInfo.color}`}>
                        {vp.rxpower?.value !== null && vp.rxpower?.value !== undefined ? `${vp.rxpower.value} dBm` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Temperature:</span>
                      <span className="font-medium">{vp.temperature?.value ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Connection Status:</span>
                      {primaryWAN ? getStatusBadge(primaryWAN.status || 'Disconnected') : <span className="modern-badge">N/A</span>}
                    </div>
                  </div>
              </div>
            </div>

            <DeviceMapLocationCard
              device={device}
              isAdmin={user?.role === 'admin'}
              onLocationSaved={(location) => {
                setDevice((current) => current ? { ...current, location } : current)
              }}
              onOpenNetworkMap={() => navigate(`/network-map?device=${encodeURIComponent(device._id)}`)}
            />
          </div>
        )}

        {/* Tab WAN */}
        {activeTab === 'wan' && (
          <div className="modern-card p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="section-heading">WAN configuration</h2>
                <p className="section-description">Existing connections reported by the ONT and a safe GenieACS addObject workflow.</p>
              </div>
              {user?.role === 'admin' && (
                <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_8rem_auto]">
                  <div>
                    <label htmlFor="wan-container" className="field-label">WAN container</label>
                    <select id="wan-container" className="modern-input max-w-full" value={wanContainer}
                      onChange={(event) => setWanContainer(event.target.value)}>
                      {(device.wanContainers || []).map((container) => (
                        <option key={container.path} value={container.path}>{container.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="wan-type" className="field-label">Type</label>
                    <select id="wan-type" className="modern-input" value={newWanType}
                      onChange={(event) => setNewWanType(event.target.value as 'ppp' | 'ip')}>
                      <option value="ppp">PPPoE</option>
                      <option value="ip">IP</option>
                    </select>
                  </div>
                  <button type="button" className="modern-button self-end" disabled={addingWan || !wanContainer}
                    onClick={() => void handleAddWan()}>
                    {addingWan ? 'Queuing…' : 'Add WAN'}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-6">
              {device.wan && device.wan.length > 0 ? (
                device.wan.map((wan) => (
                  <div key={wan.index} className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-md">
                    <div className="p-5 space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                          {wan.name || `Connection ${wan.index}`}
                        </h3>
                        {getStatusBadge(wan.status || 'Disconnected')}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">VLAN ID:</span>
                            <span className="font-medium">
                              { (wan.vlanId === null || wan.vlanId === undefined) ? (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">
                                  not set
                                </span>
                              ) : (
                                String(wan.vlanId)
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Username:</span>
                            <span className="font-mono text-sm">{wan.username || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">IP Address:</span>
                            <span className="font-mono text-sm">{wan.ipAddress || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Service:</span>
                            <span className="font-medium">
                            { (wan.serviceList === null || wan.serviceList === undefined) ? (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">
                                  not set
                                </span>
                              ) : (
                                wan.serviceList
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Connection Type:</span>
                            <span className="font-medium">{wan.connectionType || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">NAT:</span>
                            <span className="font-medium">
                              { (wan.natEnabled === null || wan.natEnabled === undefined) ? 'N/A' : (
                                wan.natEnabled ? 'Enabled' : 'Disabled'
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Visual Interface Binding */}
                      {wan.bindings && (wan.bindings.lan.length > 0 || wan.bindings.ssid.length > 0) ? (
                        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <h4 className="flex items-center text-md font-semibold mb-4 text-gray-900 dark:text-gray-100">
                            <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.135a4 4 0 000-5.656l-4-4a4 4 0 00-5.656 0zm0 0L9.5 7.5"></path>
                            </svg>
                            Interface Bindings
                          </h4>

                          {/* LAN Ports */}
                          <div className="mb-4">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LAN Ports</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[1, 2, 3, 4].map(i => (
                                <div key={`lan-${i}`} className="flex-1 min-w-[80px]">
                                  {renderBindingBox(`LAN${i}`, wan.bindings?.lan.includes(`LAN${i}`) || false)}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* WiFi Networks */}
                          <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">WiFi Networks</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                <div key={`ssid-${i}`} className="flex-1 min-w-[80px]">
                                  {renderBindingBox(`SSID${i}`, wan.bindings?.ssid.includes(`SSID${i}`) || false)}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : wan.bindings ? (
                        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <h4 className="flex items-center text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.135a4 4 0 000-5.656l-4-4a4 4 0 00-5.656 0zm0 0L9.5 7.5"></path>
                            </svg>
                            Interface Bindings
                          </h4>
                          <span className="text-gray-500 dark:text-gray-400 text-sm">No active interface bindings found for this connection.</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="px-5 pb-5 pt-2">
                      {wan.editable ? (
                        <button
                          onClick={() => handleOpenEditModal(wan)}
                          className="w-full modern-button-secondary flex items-center justify-center space-x-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                          </svg>
                          <span>Edit WAN Connection</span>
                        </button>
                      ) : (
                        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                          Only PPPoE connections can be edited.
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No WAN connection data found.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="modern-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="section-heading">Connected-device inventory</h2>
                <p className="section-description">Online and offline hosts reported by the ONT through TR-098 or TR-181.</p>
              </div>
              <div className="flex gap-2">
                <span className="modern-badge-success">{device.clients?.filter((client) => client.active === true).length || 0} online</span>
                <span className="modern-badge">{device.clients?.filter((client) => client.active === false).length || 0} offline</span>
              </div>
            </div>
            {device.clients?.length ? (
              <>
                <div className="grid gap-3 p-4 md:hidden">
                  {device.clients.map((client) => (
                    <article key={`${client.dataModel}-${client.instance}-${client.macAddress || client.ipAddress || ''}`} className="rounded-md border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{client.hostName || 'Unnamed client'}</h3>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{client.macAddress || 'MAC not reported'}</p>
                        </div>
                        <span className={client.active === true ? 'modern-badge-success' : client.active === false ? 'modern-badge' : 'modern-badge-warning'}>
                          {client.active === true ? 'Online' : client.active === false ? 'Offline' : 'Unknown'}
                        </span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div><dt className="text-xs text-muted-foreground">IP address</dt><dd className="mt-1 break-all font-mono">{client.ipAddress || '—'}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Interface</dt><dd className="mt-1 break-all">{client.interfaceType || '—'}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="modern-table">
                    <thead><tr><th>Status</th><th>Hostname</th><th>IP address</th><th>MAC address</th><th>Interface</th><th>Source</th></tr></thead>
                    <tbody>
                      {device.clients.map((client) => (
                        <tr key={`${client.dataModel}-${client.instance}-${client.macAddress || client.ipAddress || ''}`}>
                          <td><span className={client.active === true ? 'modern-badge-success' : client.active === false ? 'modern-badge' : 'modern-badge-warning'}>{client.active === true ? 'Online' : client.active === false ? 'Offline' : 'Unknown'}</span></td>
                          <td className="font-semibold">{client.hostName || 'Unnamed client'}</td>
                          <td className="font-mono text-xs">{client.ipAddress || '—'}</td>
                          <td className="font-mono text-xs">{client.macAddress || '—'}</td>
                          <td>{client.interfaceType || '—'}</td>
                          <td>{client.addressSource || client.dataModel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><Icon name="phone" size={22} /></div>
                <h3 className="empty-state-title">No host inventory reported</h3>
                <p className="empty-state-copy">Request an Inform or confirm that the ONT exposes its Hosts table through CWMP.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab WiFi */}
        {activeTab === 'wifi' && (
          <div className="modern-card p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="section-heading">WiFi configuration</h2>
              <p className="section-description mt-1">Review every reported WLAN instance and queue typed GenieACS configuration tasks.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {device.wifi && device.wifi.length > 0 ? (
                device.wifi.map((ssid) => (
                  <div key={ssid.index} className="rounded-md border border-border bg-[hsl(var(--surface-subtle))] p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground">SSID {ssid.index}</h3>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className={ssid.enable === false ? 'modern-badge-error' : ssid.enable === true ? 'modern-badge-success' : 'modern-badge'}>
                            {ssid.enable === false ? 'Disabled' : ssid.enable === true ? 'Enabled' : 'Unknown state'}
                          </span>
                          {ssid.usesVirtualParameters && <span className="modern-badge-info">Installer VP</span>}
                        </div>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">CH {ssid.channel ?? '—'}</span>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Network name</dt>
                        <dd className="max-w-[65%] break-all text-right font-mono font-semibold">{ssid.ssid || 'Not reported'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Password</dt>
                        <dd className="font-mono">{ssid.password ? '••••••••' : 'Not reported'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Security</dt>
                        <dd className="text-right">{ssid.security || 'Not reported'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Associated clients</dt>
                        <dd className="font-mono font-semibold">{ssid.totalAssociations ?? 0}</dd>
                      </div>
                    </dl>
                    {user?.role === 'admin' ? (
                      <button type="button" onClick={() => setEditingWifi(ssid)} className="modern-button-secondary mt-5 w-full">
                        <Icon name="edit" size={17} /> Edit SSID {ssid.index}
                      </button>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">Administrator access is required to change WiFi configuration.</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 md:col-span-2">No WiFi SSIDs reported.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab Advanced */}
        {activeTab === 'advanced' && (
          <div className="modern-card p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Advanced Configuration</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-900 dark:text-gray-100">Change Credentials</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                    <h4 className="font-medium mb-2 text-gray-900 dark:text-gray-100">Superadmin (ISP)</h4>
                    <p className="text-sm text-gray-500">User: {vp.superAdmin?.value || 'N/A'}</p>
                    <p className="text-sm text-gray-500">Pass: {vp.superPassword?.value ? '******' : 'N/A'}</p>
                    <button
                      onClick={() => handleOpenCredentialModal('super')}
                      className="modern-button mt-3"
                    >
                      Update Superadmin
                    </button>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                    <h4 className="font-medium mb-2 text-gray-900 dark:text-gray-100">Useradmin (Client)</h4>
                    <p className="text-sm text-gray-500">User: {vp.userAdmin?.value || 'N/A'}</p>
                    <p className="text-sm text-gray-500">Pass: {vp.userPassword?.value ? '******' : 'N/A'}</p>
                    <button
                      onClick={() => handleOpenCredentialModal('user')}
                      className="modern-button mt-3"
                    >
                      Update Useradmin
                    </button>
                  </div>
                </div>
              </div>

              {/* <div>
                <h3 className="text-md font-medium mb-3 text-gray-900 dark:text-gray-100">Raw Device Data (Debug)</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-4">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(device._raw || device, null, 2)}
                  </pre>
                </div>
              </div> */}
            </div>
          </div>
        )}
        <EditWanModal
          isOpen={isWanModalOpen}
          onClose={handleCloseWanModal}
          wanData={editingWan}
          onSave={handleSaveWan}
        />
        <EditCredentialModal
          isOpen={isCredentialModalOpen}
          onClose={handleCloseCredentialModal}
          credentialType={credentialType}
          username={
            credentialType === 'super' ? (vp.superAdmin?.value || 'N/A') :
            credentialType === 'user' ? (vp.userAdmin?.value || 'N/A') :
            ''
          }
          onSave={handleSaveCredentials}
        />
        <EditWifiModal
          wifi={editingWifi}
          onClose={() => setEditingWifi(null)}
          onSave={handleSaveWifi}
          saving={savingWifi}
        />
        <AlertDialog open={rebootConfirmOpen} onOpenChange={setRebootConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reboot {device?._id || deviceId}?</AlertDialogTitle>
              <AlertDialogDescription>
                The subscriber connection may be unavailable while the device restarts. Existing configuration is preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void executeReboot()}>Reboot device</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={remoteModalOpen} onOpenChange={setRemoteModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-6">
                <DialogTitle>Remote Device Web UI</DialogTitle>
                <Badge variant={device.remoteAccess?.enabled ? 'secondary' : 'outline'}>
                  {device.remoteAccess?.enabled ? 'Proxy Active' : 'Proxy Disabled'}
                </Badge>
              </div>
              <DialogDescription>
                Akses halaman web ONT melalui reverse proxy subdomain menuju IP TR-069 perangkat.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Subdomain URL
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-sm font-semibold text-primary">
                    {device.remoteAccess?.cleanUrl || `${deviceInfo.serialNumber || device._id}.domainku.com`}
                  </code>
                  {device.remoteAccess?.cleanUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void copyToClipboard(device.remoteAccess!.cleanUrl!).then((ok) => {
                          if (ok) toast.success('Subdomain URL disalin')
                        })
                      }}
                    >
                      Copy
                    </Button>
                  )}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  Target aktif:{' '}
                  <strong className="font-mono text-foreground">
                    {remoteProtocol}://{remoteIpOverride.trim() || device.ipTr069 || 'N/A'}:{remotePort || '80'}
                  </strong>{' '}
                  {device.ipTr069Source && !remoteIpOverride.trim() ? `(${device.ipTr069Source})` : ''}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="remote-ip-override">Target IP (Kosongkan untuk otomatis dari IPTR069)</Label>
                  <Input
                    id="remote-ip-override"
                    className="font-mono"
                    placeholder={device.ipTr069 || '172.20.255.252'}
                    value={remoteIpOverride}
                    onChange={(e) => setRemoteIpOverride(e.target.value)}
                  />
                  {device.wan?.some((w) => w.ipAddress) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant={remoteIpOverride === '' ? 'secondary' : 'outline'}
                        size="xs"
                        onClick={() => setRemoteIpOverride('')}
                      >
                        Auto ({device.ipTr069 || 'N/A'})
                      </Button>
                      {device.wan
                        .filter((w) => Boolean(w.ipAddress))
                        .map((w) => (
                          <Button
                            key={w.index}
                            type="button"
                            variant={remoteIpOverride === w.ipAddress ? 'secondary' : 'outline'}
                            size="xs"
                            className="font-mono"
                            onClick={() => setRemoteIpOverride(w.ipAddress || '')}
                          >
                            {w.ipAddress} ({w.serviceList || w.name || w.index})
                          </Button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="remote-target-protocol">Upstream protocol</Label>
                  <select
                    id="remote-target-protocol"
                    className="modern-input"
                    value={remoteProtocol}
                    onChange={(e) => setRemoteProtocol(e.target.value === 'https' ? 'https' : 'http')}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS (Self-signed OK)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="remote-target-port">ONT web port</Label>
                  <Input
                    id="remote-target-port"
                    type="number"
                    min={1}
                    max={65535}
                    className="font-mono"
                    value={remotePort}
                    onChange={(e) => setRemotePort(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={launchingRemote}
                onClick={() => void handleLaunchRemote(true, false)}
              >
                Save preference
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setRemoteModalOpen(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  disabled={launchingRemote || !(remoteIpOverride.trim() || device.ipTr069)}
                  onClick={() => void handleLaunchRemote(true, true)}
                >
                  {launchingRemote ? <Spinner data-icon="inline-start" /> : <Icon name="external" size={16} />}
                  Open Remote Web
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { apiClient, vendorsAPI, settingsAPI, authAPI, databaseAPI, type DbConfigPayload } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { useLoading } from '@/components/ui/loading'
import { Icon } from '@/components/ui/icon'
import type { Vendor as VendorType, WifiSecurityConfig as WifiSecurityConfigType } from '@/types'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const INSTALLER_VIRTUAL_PARAMETERS = {
  vpPppoeUsername: 'VirtualParameters.PPPUsername',
  vpWanBridge: 'VirtualParameters.WANBridge',
  vpRxPower: 'VirtualParameters.OpticalRXPower',
  vpTemperature: 'VirtualParameters.OpticalTemperature',
  vpActiveDevices: 'VirtualParameters.TotalStations',
  vpSuperAdmin: 'VirtualParameters.LoginSuperUser',
  vpSuperPassword: 'VirtualParameters.LoginSuperPass',
  vpUserAdmin: '',
  vpUserPassword: '',
  vpIpTr069: 'VirtualParameters.IPTR069'
}

const VIRTUAL_PARAMETER_FIELDS = [
  { key: 'vpPppoeUsername', label: 'PPPoE username', description: 'PPPUsername' },
  { key: 'vpWanBridge', label: 'WAN bridge status', description: 'WANBridge' },
  { key: 'vpRxPower', label: 'Optical RX power', description: 'OpticalRXPower' },
  { key: 'vpTemperature', label: 'Optical temperature', description: 'OpticalTemperature' },
  { key: 'vpActiveDevices', label: 'Connected stations', description: 'TotalStations' },
  { key: 'vpSuperAdmin', label: 'Super-admin username', description: 'LoginSuperUser' },
  { key: 'vpSuperPassword', label: 'Super-admin password', description: 'LoginSuperPass' },
  { key: 'vpUserAdmin', label: 'Operator username', description: 'Optional; not supplied by genieacs-installer' },
  { key: 'vpUserPassword', label: 'Operator password', description: 'Optional; not supplied by genieacs-installer' },
  { key: 'vpIpTr069', label: 'IP TR-069 (Remote Target)', description: 'IPTR069 · Multi-vendor target IP for remote proxy' }
] as const

export default function Settings() {
  const [settings, setSettings] = useState({
    appName: 'SkyGenPanel',
    genieAcsUrl: 'http://127.0.0.1:7557',
    autoGenerateCustomerId: 'false',
    customerIdPrefixMode: 'default',
    customerIdCompanyPrefix: 'CSG',
    customerIdSuffixMode: 'random',
    remoteProxyEnabled: 'false',
    remoteProxyBaseDomain: '',
    remoteProxyScheme: 'https',
    remoteProxyDefaultPort: '80',
    remoteProxyAuthMode: 'token',
    googleMapsApiKey: '',
    ...INSTALLER_VIRTUAL_PARAMETERS
  })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [testResult, setTestResult] = useState<{ success: boolean, message: string, deviceCount?: number } | null>(null)
  const [dbForm, setDbForm] = useState<DbConfigPayload>({
    client: 'mysql2', host: 'localhost', port: 3306, user: '', password: '', database: '', migrateData: true
  })
  const [activeDb, setActiveDb] = useState<{ client: string; host?: string; database?: string } | null>(null)
  const [dbTesting, setDbTesting] = useState(false)
  const [dbSwitching, setDbSwitching] = useState(false)
  const [exportingBackup, setExportingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(false)
  const [backupFileName, setBackupFileName] = useState('')
  const [parsedBackup, setParsedBackup] = useState<any | null>(null)
  const [preserveCurrentAdmin, setPreserveCurrentAdmin] = useState(true)
  const [confirmState, setConfirmState] = useState<{
    title: string
    description: string
    actionLabel: string
    onConfirm: () => Promise<void>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        const res = await settingsAPI.getAll()
        if (!cancelled && res.success && res.data) {
          setSettings(prev => ({ ...prev, ...(res.data as any) }))
        }
        setTestResult(null)
      })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (activeTab !== 'database') return
    let cancelled = false
      ; (async () => {
        const res = await databaseAPI.getConfig()
        if (!cancelled && res.success && res.data) {
          setActiveDb(res.data as any)
        }
      })()
    return () => { cancelled = true }
  }, [activeTab])

  const handleDbTest = async () => {
    setDbTesting(true)
    try {
      const res = await databaseAPI.test(dbForm)
      const message = res.message || (res.success ? 'Connection successful' : 'Connection failed')
      toast[res.success ? 'success' : 'error'](message)
    } catch (e: any) {
      toast.error(e?.message || 'Test failed')
    } finally {
      setDbTesting(false)
    }
  }

  const handleDbSwitch = () => {
    const label = dbForm.client === 'sqlite3' ? 'SQLite (local file)' : `MySQL ${dbForm.database}@${dbForm.host}`
    setConfirmState({
      title: `Switch database to ${label}?`,
      description: `${dbForm.migrateData ? 'Existing data WILL be copied to the new database.' : 'The target database will be used without copying existing data.'} The change takes effect immediately.`,
      actionLabel: 'Switch Database',
      onConfirm: async () => {
        setDbSwitching(true)
        try {
          const res = await databaseAPI.switch(dbForm)
          const message = res.message || (res.success ? 'Database switched' : 'Switch failed')
          toast[res.success ? 'success' : 'error'](message)
          if (res.success && res.data) setActiveDb(res.data as any)
        } catch (e: any) {
          toast.error(e?.message || 'Switch failed')
        } finally {
          setDbSwitching(false)
        }
      },
    })
  }

  const handleExportBackup = async () => {
    setExportingBackup(true)
    try {
      const res = await databaseAPI.exportBackup()
      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal membuat backup database')
        return
      }
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
      const fileName = `skygenpanel-backup-${stamp}.json`
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success(`Backup diunduh (${fileName})`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengunduh backup')
    } finally {
      setExportingBackup(false)
    }
  }

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !parsed.tables || typeof parsed.tables !== 'object') {
        toast.error('File JSON bukan format backup SkyGenPanel yang valid')
        setParsedBackup(null)
        setBackupFileName('')
        return
      }
      setParsedBackup(parsed)
      setBackupFileName(file.name)
    } catch {
      toast.error('File gagal dibaca. Pastikan file backup berformat JSON valid.')
      setParsedBackup(null)
      setBackupFileName('')
    } finally {
      event.target.value = ''
    }
  }

  const handleRestoreBackup = () => {
    if (!parsedBackup) return
    setConfirmState({
      title: 'Restore database dari file backup?',
      description: `Data pada database saat ini akan diganti dengan isi dari "${backupFileName}". ${preserveCurrentAdmin ? 'Akun admin/user login saat ini akan dipertahankan.' : 'Semua akun user juga akan diganti sesuai isi backup.'}`,
      actionLabel: 'Restore Database',
      onConfirm: async () => {
        setRestoringBackup(true)
        loadingCtl.show('Merestore database...')
        try {
          const res = await databaseAPI.restoreBackup(parsedBackup, { preserveCurrentAdmin })
          if (!res.success) {
            toast.error(res.message || 'Restore database gagal')
            return
          }
          toast.success(res.message || 'Database berhasil di-restore')
          setParsedBackup(null)
          setBackupFileName('')
          const latest = await settingsAPI.getAll()
          if (latest.success && latest.data) {
            const nextSettings = latest.data as Record<string, string>
            setSettings((prev) => ({ ...prev, ...nextSettings }))
            if (nextSettings.appName) {
              try {
                localStorage.setItem('appName', nextSettings.appName)
                window.dispatchEvent(new CustomEvent('appNameChanged', { detail: nextSettings.appName }))
              } catch { }
            }
          }
        } catch (e: any) {
          toast.error(e?.message || 'Restore database gagal')
        } finally {
          setRestoringBackup(false)
          loadingCtl.hide()
        }
      },
    })
  }

  const handleTestConnection = async () => {
    setLoading(true)
    loadingCtl.show('Testing GenieACS connection...')
    try {
      const res = await settingsAPI.testGenieAcs(settings.genieAcsUrl)
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || 'Connection successful!',
          deviceCount: (res.data as any)?.deviceCount
        })
        toast.success('GenieACS connection OK')
      } else {
        setTestResult({
          success: false,
          message: res.message || 'Connection failed'
        })
        toast.error(res.message || 'Connection failed')
      }
    } finally {
      setLoading(false)
      loadingCtl.hide()
    }
  }

  const toast = useToast()
  const loadingCtl = useLoading()

  const [usernameForm, setUsernameForm] = useState<{ currentUsername: string; newUsername: string }>({
    currentUsername: '',
    newUsername: ''
  })
  const [passwordForm, setPasswordForm] = useState<{ currentPassword: string; newPassword: string; confirmNewPassword: string }>({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  })

  const submitChangeUsername = async () => {
    const res = await authAPI.changeUsername(usernameForm.currentUsername, usernameForm.newUsername)
    if (res.success) {
      toast.success(res.message || 'Username updated successfully')
      setUsernameForm({ currentUsername: '', newUsername: '' })
    } else {
      toast.error(res.message || 'Failed to update username')
    }
  }

  const submitChangePassword = async () => {
    if (!passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      toast.error('New password and confirmation do not match')
      return
    }
    const res = await authAPI.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
    if (res.success) {
      toast.success('Password updated. Sign in again with the new password.')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
      apiClient.clearTokens()
    } else {
      toast.error(res.message || 'Failed to update password')
    }
  }

  const handleSaveSettings = async () => {
    setLoading(true)
    loadingCtl.show('Saving settings...')
    let ok = true
    try {
      const entries = Object.entries(settings).sort(([left], [right]) => {
        if (left === 'autoGenerateCustomerId') return 1
        if (right === 'autoGenerateCustomerId') return -1
        return 0
      })
      for (const [key, value] of entries) {
        const res = await settingsAPI.update(key, String(value))
        if (!res.success) {
          ok = false
          break
        }
      }
      let successMessage = 'Settings saved successfully'
      let errorMessage = 'Some settings failed to save'
      if (ok && settings.autoGenerateCustomerId === 'true') {
        const sync = await settingsAPI.syncCustomerIds()
        if (!sync.success) {
          ok = false
          errorMessage = sync.message || 'Failed to synchronize Customer IDs'
        } else {
          const result = sync.data as { generated?: number; existing?: number; pending?: number }
          successMessage = `${sync.message || 'Customer IDs synchronized'} · ${result.generated || 0} new, ${result.existing || 0} preserved`
        }
      }
      toast[ok ? 'success' : 'error'](ok ? successMessage : errorMessage)
      if (ok) {
        try {
          localStorage.setItem('appName', settings.appName)
          window.dispatchEvent(new CustomEvent('appNameChanged', { detail: settings.appName }))
        } catch { }
      }
    } finally {
      setLoading(false)
      loadingCtl.hide()
    }
  }

  const [vendorList, setVendorList] = useState<VendorType[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(false)
  const [creatingVendor, setCreatingVendor] = useState(false)
  const [editingVendor, setEditingVendor] = useState<VendorType | null>(null)

  const [vendorForm, setVendorForm] = useState<{
    name: string
    parameter_prefix: string
    manufacturer_patterns: string
    product_patterns: string
    service_list_path: string
    lan_binding_path: string
    vlan_id_path: string
    wifi_password_path: string
    http_wan_enable_path: string
    firewall_level_path: string
    priority: number
    enabled: number
    description: string
  }>({
    name: '',
    parameter_prefix: '',
    manufacturer_patterns: '',
    product_patterns: '',
    service_list_path: '',
    lan_binding_path: '',
    vlan_id_path: '',
    wifi_password_path: '',
    http_wan_enable_path: '',
    firewall_level_path: '',
    priority: 10,
    enabled: 1,
    description: '',
  })

  const fetchVendors = async () => {
    setVendorsLoading(true)
    const res = await vendorsAPI.getAll()
    if (res.success && Array.isArray(res.data)) {
      setVendorList(res.data as unknown as VendorType[])
    }
    setVendorsLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'vendors') {
      fetchVendors()
    }
  }, [activeTab])

  const resetVendorForm = () => {
    setVendorForm({
      name: '',
      parameter_prefix: '',
      manufacturer_patterns: '',
      product_patterns: '',
      service_list_path: '',
      lan_binding_path: '',
      vlan_id_path: '',
      wifi_password_path: '',
      http_wan_enable_path: '',
      firewall_level_path: '',
      priority: 10,
      enabled: 1,
      description: '',
    })
    setEditingVendor(null)
    setCreatingVendor(false)
  }

  const submitVendor = async () => {
    const payload: any = {
      name: vendorForm.name,
      parameter_prefix: vendorForm.parameter_prefix || null,
      manufacturer_patterns: vendorForm.manufacturer_patterns.split(',').map(s => s.trim()).filter(Boolean),
      product_patterns: vendorForm.product_patterns.split(',').map(s => s.trim()).filter(Boolean),
      service_list_path: vendorForm.service_list_path || null,
      lan_binding_path: vendorForm.lan_binding_path || null,
      vlan_id_path: vendorForm.vlan_id_path || null,
      wifi_password_path: vendorForm.wifi_password_path || null,
      http_wan_enable_path: vendorForm.http_wan_enable_path || null,
      firewall_level_path: vendorForm.firewall_level_path || null,
      priority: Number(vendorForm.priority) || 10,
      enabled: Number(vendorForm.enabled) ? 1 : 0,
      description: vendorForm.description || null,
    }
    let res
    if (editingVendor) {
      res = await vendorsAPI.update(editingVendor.id, payload)
    } else {
      res = await vendorsAPI.create(payload)
    }
    if (res.success) {
      const msg = editingVendor ? 'Vendor updated' : 'Vendor created'
      toast.success(msg)
      await fetchVendors()
      resetVendorForm()
    } else {
      const msg = res.message || 'Operation failed'
      toast.error(msg)
    }
  }

  const deleteVendor = (id: number) => {
    const vendor = vendorList.find((item) => item.id === id)
    setConfirmState({
      title: `Delete vendor profile "${vendor?.name || id}"?`,
      description: 'Devices will no longer use this profile for parameter discovery. This cannot be undone.',
      actionLabel: 'Delete Vendor',
      onConfirm: async () => {
        const res = await vendorsAPI.delete(id)
        if (res.success) {
          setVendorList(prev => prev.filter(v => v.id !== id))
          toast.success('Vendor deleted')
        } else {
          toast.error(res.message || 'Failed to delete vendor')
        }
      },
    })
  }

  const [wifiConfigs, setWifiConfigs] = useState<WifiSecurityConfigType[]>([])
  const [wifiConfigLoading, setWifiConfigLoading] = useState(false)
  const [creatingConfig, setCreatingConfig] = useState(false)
  const [configForm, setConfigForm] = useState<{ product_class: string; security_types: string; password_param_path: string }>({
    product_class: '',
    security_types: '',
    password_param_path: ''
  })
  const [editingConfig, setEditingConfig] = useState<WifiSecurityConfigType | null>(null)

  const fetchWifiConfigs = async () => {
    setWifiConfigLoading(true)
    const res = await vendorsAPI.getAllWifiSecurityConfigs()
    if (res.success && Array.isArray(res.data)) {
      setWifiConfigs(res.data as unknown as WifiSecurityConfigType[])
    }
    setWifiConfigLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'wifi-security') {
      fetchWifiConfigs()
    }
  }, [activeTab])

  const resetConfigForm = () => {
    setConfigForm({ product_class: '', security_types: '', password_param_path: '' })
    setEditingConfig(null)
    setCreatingConfig(false)
  }

  const submitWifiConfig = async () => {
    const payload = {
      product_class: configForm.product_class,
      security_types: configForm.security_types,
      password_param_path: configForm.password_param_path,
    }
    let res
    if (editingConfig) {
      res = await vendorsAPI.updateWifiSecurityConfig(editingConfig.id, payload)
    } else {
      res = await vendorsAPI.createWifiSecurityConfig(payload)
    }
    if (res.success) {
      const msg = editingConfig ? 'WiFi security config updated' : 'WiFi security config created'
      toast.success(msg)
      await fetchWifiConfigs()
      resetConfigForm()
    } else {
      const msg = res.message || 'Operation failed'
      toast.error(msg)
    }
  }

  const deleteWifiConfig = (id: number) => {
    const config = wifiConfigs.find((item) => item.id === id)
    setConfirmState({
      title: `Delete WiFi mapping for "${config?.product_class || id}"?`,
      description: 'Password and security parameters for this product class will no longer be resolved. This cannot be undone.',
      actionLabel: 'Delete Mapping',
      onConfirm: async () => {
        const res = await vendorsAPI.deleteWifiSecurityConfig(id)
        if (res.success) {
          setWifiConfigs(prev => prev.filter(c => c.id !== id))
          toast.success('WiFi security config deleted')
        } else {
          toast.error(res.message || 'Failed to delete config')
        }
      },
    })
  }

  return (
    <div className="page-shell">
      <div className="page-frame">
        <header className="page-header">
          <div>
            <p className="page-kicker">System administration</p>
            <h1 className="page-title">Panel configuration</h1>
            <p className="page-description">Kelola koneksi GenieACS, jalur parameter vendor, akun administrator, dan penyimpanan data panel.</p>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="general">Panel & ACS</TabsTrigger>
              <TabsTrigger value="virtual-params">TR-069 parameters</TabsTrigger>
              <TabsTrigger value="customer-portal">Customer portal</TabsTrigger>
              <TabsTrigger value="security">Account access</TabsTrigger>
              <TabsTrigger value="vendors">Vendor profiles</TabsTrigger>
              <TabsTrigger value="wifi-security">WiFi mappings</TabsTrigger>
              <TabsTrigger value="database">Data store</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {/* Content */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* App Settings */}
            <div className="modern-card max-w-3xl p-5 sm:p-6">
              <h2 className="section-heading">Panel identity and ACS endpoint</h2>
              <p className="section-description mb-6">Nama tampil panel dan alamat northbound API GenieACS.</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="application-name" className="field-label">Application name</label>
                  <input
                    id="application-name"
                    type="text"
                    value={settings.appName}
                    onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                    className="modern-input w-full"
                  />
                </div>
                <div>
                  <label htmlFor="genieacs-url" className="field-label">GenieACS URL</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="genieacs-url"
                      type="url"
                      placeholder="http://127.0.0.1:7557"
                      value={settings.genieAcsUrl}
                      onChange={(e) => setSettings({ ...settings, genieAcsUrl: e.target.value })}
                      className="modern-input flex-1"
                    />
                    <button
                      onClick={handleTestConnection}
                      disabled={loading}
                      className="modern-button"
                    >
                      {loading ? 'Testing…' : 'Test connection'}
                    </button>
                  </div>
                  <p className="field-hint">Masukkan base URL northbound API (NBI), biasanya port 7557. Path <code>/devices</code> ditambahkan otomatis.</p>
                </div>
                <div>
                  <label htmlFor="google-maps-api-key" className="field-label">Google Maps JavaScript API Key</label>
                  <input
                    id="google-maps-api-key"
                    type="text"
                    placeholder="AIzaSy..."
                    value={settings.googleMapsApiKey}
                    onChange={(e) => setSettings({ ...settings, googleMapsApiKey: e.target.value.trim() })}
                    className="modern-input w-full font-mono text-sm"
                  />
                  <p className="field-hint">Opsional. Jika diisi, Network Map dan Device Map Location menggunakan Google Maps JS API (mode Roadmap menyembunyikan ikon POI namun mempertahankan nama tempat).</p>
                </div>
              </div>

              {testResult && (
                <div className={`mt-4 p-4 rounded-md ${testResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}>
                  <div className="flex items-center">
                    <Icon name={testResult.success ? 'check' : 'x'} size={18} className="mr-2" />
                    <span className="font-medium">{testResult.message}</span>
                    {testResult.deviceCount && (
                      <span className="ml-2 text-sm">
                        ({testResult.deviceCount} devices found)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Remote Device Reverse Proxy */}
            <Card className="max-w-3xl">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Remote device reverse proxy (Subdomain)</CardTitle>
                    <CardDescription>
                      Akses web GUI ONT melalui subdomain berbasis Serial Number menuju IP dari parameter <code className="font-mono">{settings.vpIpTr069 || 'VirtualParameters.IPTR069'}</code>.
                    </CardDescription>
                  </div>
                  <Badge variant={settings.remoteProxyEnabled === 'true' ? 'secondary' : 'outline'}>
                    {settings.remoteProxyEnabled === 'true' ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
                  <div>
                    <span className="block text-sm font-semibold">Enable remote device proxy</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Teruskan request subdomain <code className="font-mono">&lt;SerialNumber&gt;.{settings.remoteProxyBaseDomain || 'domainku.com'}</code> ke IP TR-069 perangkat.
                    </span>
                  </div>
                  <Switch
                    checked={settings.remoteProxyEnabled === 'true'}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({ ...prev, remoteProxyEnabled: checked ? 'true' : 'false' }))
                    }
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="remote-base-domain">Wildcard base domain</Label>
                    <Input
                      id="remote-base-domain"
                      className="font-mono"
                      placeholder="domainku.com"
                      value={settings.remoteProxyBaseDomain}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          remoteProxyBaseDomain: e.target.value.trim().toLowerCase().replace(/^\*\./, ''),
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Kosongkan untuk pengujian lokal (<code className="font-mono">&lt;SerialNumber&gt;.localhost:5890</code>). Untuk produksi, arahkan wildcard DNS / Cloudflare Tunnel <code className="font-mono">*.{settings.remoteProxyBaseDomain || 'domainku.com'}</code> ke port panel (<code className="font-mono">5890</code>).
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="remote-scheme">Public URL scheme</Label>
                    <Select
                      value={settings.remoteProxyScheme}
                      onValueChange={(value) => setSettings((prev) => ({ ...prev, remoteProxyScheme: value }))}
                    >
                      <SelectTrigger id="remote-scheme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="https">HTTPS (Recommended)</SelectItem>
                          <SelectItem value="http">HTTP</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="remote-default-port">Default ONT web port</Label>
                    <Input
                      id="remote-default-port"
                      type="number"
                      min={1}
                      max={65535}
                      className="font-mono"
                      value={settings.remoteProxyDefaultPort}
                      onChange={(e) => setSettings((prev) => ({ ...prev, remoteProxyDefaultPort: e.target.value }))}
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="remote-auth-mode">Subdomain access protection</Label>
                    <Select
                      value={settings.remoteProxyAuthMode}
                      onValueChange={(value) => setSettings((prev) => ({ ...prev, remoteProxyAuthMode: value }))}
                    >
                      <SelectTrigger id="remote-auth-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="token">
                            Require Operator Token (Hanya bisa dibuka oleh operator yang login di panel)
                          </SelectItem>
                          <SelectItem value="none">
                            Open Subdomain (Langsung buka halaman login bawaan ONT)
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-xs">
                  <div className="font-semibold text-foreground">Contoh hasil pemetaan subdomain:</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-primary">
                    <span>
                      {settings.remoteProxyScheme}://ZICG08A00229.{settings.remoteProxyBaseDomain || 'domainku.com'}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-foreground">
                      http://172.20.255.252:{settings.remoteProxyDefaultPort || '80'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'virtual-params' && (
          <div className="modern-card p-5 sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="section-heading">Virtual parameter mappings</h2>
                <p className="section-description mt-1">
                  Preset ini mengikuti nama virtual parameter dari repository <span className="font-mono">skydashnet/genieacs-installer</span>.
                </p>
              </div>
              <button
                type="button"
                className="modern-button-secondary shrink-0"
                onClick={() => setSettings((current) => ({ ...current, ...INSTALLER_VIRTUAL_PARAMETERS }))}
              >
                <Icon name="refresh" size={17} />
                Use installer preset
              </button>
            </div>
            <div className="mb-6 rounded-md border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.08)] p-4 text-sm text-foreground">
              SkyGenPanel hanya membaca mapping ini. Script virtual parameter harus sudah diimpor ke GenieACS menggunakan installer tersebut.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {VIRTUAL_PARAMETER_FIELDS.map((field) => (
                <div key={field.key}>
                  <label htmlFor={field.key} className="field-label">
                    {field.label}
                  </label>
                  <input
                    id={field.key}
                    type="text"
                    value={settings[field.key]}
                    placeholder={field.description.startsWith('Optional') ? 'Leave empty if unavailable' : undefined}
                    onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                    className="modern-input w-full font-mono text-sm"
                  />
                  <p className="field-hint">{field.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'customer-portal' && (
          <div className="modern-card max-w-3xl p-5 sm:p-6">
            <p className="page-kicker">Self-service access</p>
            <h2 className="section-heading">Portal pelanggan</h2>
            <p className="section-description mb-6">
              Portal berjalan terpisah pada port <span className="font-mono font-semibold">5891</span> dan hanya menampilkan ringkasan ONT yang aman untuk pelanggan.
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-[hsl(var(--surface-subtle))] p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                checked={settings.autoGenerateCustomerId === 'true'}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  autoGenerateCustomerId: event.target.checked ? 'true' : 'false'
                }))}
              />
              <span>
                <span className="block font-semibold">Auto Generate ID Customer</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  Buat ID permanen berformat <span className="font-mono">CSG-XXXXXXX-XXXXXX</span> untuk ONT yang memiliki SoftwareVersion dan PPPoE username.
                </span>
              </span>
            </label>

            <div className="mt-5 grid gap-5 rounded-md border border-border p-4 sm:grid-cols-2">
              <fieldset>
                <legend className="field-label">Awalan ID</legend>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="customer-prefix" value="default"
                      checked={settings.customerIdPrefixMode === 'default'}
                      onChange={() => setSettings((current) => ({ ...current, customerIdPrefixMode: 'default' }))} />
                    Bawaan <span className="font-mono font-semibold">CSG</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="customer-prefix" value="company"
                      checked={settings.customerIdPrefixMode === 'company'}
                      onChange={() => setSettings((current) => ({ ...current, customerIdPrefixMode: 'company' }))} />
                    ID perusahaan
                  </label>
                  {settings.customerIdPrefixMode === 'company' && (
                    <input
                      aria-label="ID perusahaan"
                      className="modern-input mt-2 font-mono uppercase"
                      minLength={2}
                      maxLength={4}
                      pattern="[A-Za-z]{2,4}"
                      value={settings.customerIdCompanyPrefix}
                      onChange={(event) => setSettings((current) => ({
                        ...current,
                        customerIdCompanyPrefix: event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4)
                      }))}
                      placeholder="ISP"
                    />
                  )}
                </div>
                <p className="field-hint">Huruf saja, 2–4 karakter. Berlaku untuk ID baru.</p>
              </fieldset>

              <fieldset>
                <legend className="field-label">Enam karakter terakhir</legend>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="customer-suffix" value="random"
                      checked={settings.customerIdSuffixMode === 'random'}
                      onChange={() => setSettings((current) => ({ ...current, customerIdSuffixMode: 'random' }))} />
                    Acak huruf dan angka
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="customer-suffix" value="installation_date"
                      checked={settings.customerIdSuffixMode === 'installation_date'}
                      onChange={() => setSettings((current) => ({ ...current, customerIdSuffixMode: 'installation_date' }))} />
                    Tanggal pemasangan <span className="font-mono text-xs text-muted-foreground">YYMMDD</span>
                  </label>
                </div>
                <p className="field-hint">Mode tanggal menunggu tanggal pemasangan di detail device sebelum membuat ID.</p>
              </fieldset>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border p-4">
                <p className="metric-label">Login pelanggan</p>
                <p className="mt-2 text-sm font-semibold">ID Customer</p>
                <p className="mt-1 text-xs text-muted-foreground">Password awal: enam karakter terakhir ID Customer.</p>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="metric-label">Identitas permanen</p>
                <p className="mt-2 text-sm font-semibold">SoftwareID + PPPoE</p>
                <p className="mt-1 text-xs text-muted-foreground">ID yang sudah tersimpan tidak berubah ketika proses sinkronisasi dijalankan ulang.</p>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-[hsl(var(--status-warning))]/40 bg-[hsl(var(--status-warning))]/10 p-4 text-sm leading-6">
              Jika opsi dimatikan, SkyGenPanel tidak membuat ID baru. ID yang sudah ada tetap disimpan agar akses pelanggan tidak berubah.
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="modern-card max-w-5xl p-5 sm:p-6">
            <h2 className="section-heading">Administrator credentials</h2>
            <p className="section-description mb-6">Perubahan berlaku pada sesi login panel, bukan kredensial perangkat atau GenieACS.</p>
            <div className="space-y-6">
              <section className="rounded-md border border-border bg-[hsl(var(--surface-subtle))] p-4">
                <h3 className="font-semibold text-foreground">Change username</h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">Masukkan username saat ini untuk mengonfirmasi kepemilikan akun.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Current Username</label>
                    <input
                      value={usernameForm.currentUsername}
                      onChange={(e) => setUsernameForm(f => ({ ...f, currentUsername: e.target.value }))}
                      className="modern-input w-full"
                      placeholder="current username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">New Username</label>
                    <input
                      value={usernameForm.newUsername}
                      onChange={(e) => setUsernameForm(f => ({ ...f, newUsername: e.target.value }))}
                      className="modern-input w-full"
                      placeholder="new username"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button onClick={submitChangeUsername} className="modern-button">Update Username</button>
                </div>
              </section>

              <section className="rounded-md border border-border bg-[hsl(var(--surface-subtle))] p-4">
                <h3 className="font-semibold text-foreground">Change password</h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">Gunakan minimal 8 karakter dan password yang berbeda dari akun ONT.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Current Password</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                      className="modern-input w-full"
                      placeholder="current password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">New Password</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="modern-input w-full"
                      placeholder="new password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={passwordForm.confirmNewPassword}
                      onChange={(e) => setPasswordForm(f => ({ ...f, confirmNewPassword: e.target.value }))}
                      className="modern-input w-full"
                      placeholder="confirm new password"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button onClick={submitChangePassword} className="modern-button">Update Password</button>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Vendors Tab */}
        {activeTab === 'vendors' && (
          <div className="space-y-6">
            {/* Vendor List */}
            <div className="modern-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Vendor Management</h2>
                <button
                  onClick={() => { resetVendorForm(); setCreatingVendor(true) }}
                  className="modern-button"
                >
                  + Add Vendor
                </button>
              </div>

              {(creatingVendor || editingVendor) && (
                <div className="mb-6 p-4 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* General Info */}
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input
                        value={vendorForm.name}
                        onChange={(e) => setVendorForm(v => ({ ...v, name: e.target.value }))}
                        className="modern-input w-full"
                        placeholder="Vendor name"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium mb-1">Manufacturer Patterns (Comma-separated) *</label>
                      <input
                        value={vendorForm.manufacturer_patterns}
                        onChange={(e) => setVendorForm(v => ({ ...v, manufacturer_patterns: e.target.value }))}
                        className="modern-input w-full"
                        placeholder="huawei, hw"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium mb-1">Product Patterns (Comma-separated) *</label>
                      <input
                        value={vendorForm.product_patterns}
                        onChange={(e) => setVendorForm(v => ({ ...v, product_patterns: e.target.value }))}
                        className="modern-input w-full"
                        placeholder="hg8, eg8, f660"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium mb-1">Parameter Prefix</label>
                      <input
                        value={vendorForm.parameter_prefix}
                        onChange={(e) => setVendorForm(v => ({ ...v, parameter_prefix: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. X_HW"
                      />
                    </div>

                    {/* WAN Connection Parameters */}
                    <h3 className="md:col-span-3 text-md font-semibold text-gray-800 dark:text-gray-200 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">WAN Connection Parameters</h3>

                    <div>
                      <label className="block text-sm font-medium mb-1">Service List Path</label>
                      <input
                        value={vendorForm.service_list_path}
                        onChange={(e) => setVendorForm(v => ({ ...v, service_list_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. X_HW_SERVICELIST"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">LAN Binding Path</label>
                      <input
                        value={vendorForm.lan_binding_path}
                        onChange={(e) => setVendorForm(v => ({ ...v, lan_binding_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. X_HW_LANBIND"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">VLAN ID Path</label>
                      <input
                        value={vendorForm.vlan_id_path}
                        onChange={(e) => setVendorForm(v => ({ ...v, vlan_id_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. X_HW_VLAN"
                      />
                    </div>

                    {/* WiFi & Security Parameters */}
                    <h3 className="md:col-span-3 text-md font-semibold text-gray-800 dark:text-gray-200 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">WiFi & Security Parameters</h3>

                    <div>
                      <label className="block text-sm font-medium mb-1">WiFi Password Path</label>
                      <input
                        value={vendorForm.wifi_password_path}
                        onChange={(e) => setVendorForm(v => ({ ...v, wifi_password_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. PreSharedKey.1.KeyPassphrase"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">HTTP WAN Enable Path</label>
                      <input
                        value={vendorForm.http_wan_enable_path}
                        onChange={(e) => setVendorForm(v => ({ ...v, http_wan_enable_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. ...AclServices.HTTPWanEnable"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Firewall Level Path</label>
                      <input
                        value={vendorForm.firewall_level_path}
                        onChange={(e) => setVendorForm(v => ({ ...v, firewall_level_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="e.g. ...X_HW_FirewallLevel"
                      />
                    </div>

                    {/* Other Parameters */}
                    <h3 className="md:col-span-3 text-md font-semibold text-gray-800 dark:text-gray-200 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">Other Parameters</h3>

                    <div>
                      <label className="block text-sm font-medium mb-1">Priority</label>
                      <input
                        type="number"
                        value={vendorForm.priority}
                        onChange={(e) => setVendorForm(v => ({ ...v, priority: Number(e.target.value) }))}
                        className="modern-input w-full"
                        placeholder="10"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        value={vendorForm.enabled}
                        onChange={(e) => setVendorForm(v => ({ ...v, enabled: Number(e.target.value) }))}
                        className="modern-input w-full"
                      >
                        <option value={1}>Enabled</option>
                        <option value={0}>Disabled</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={vendorForm.description}
                        onChange={(e) => setVendorForm(v => ({ ...v, description: e.target.value }))}
                        className="modern-input w-full"
                        rows={2}
                        placeholder="Optional description"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={submitVendor} className="modern-button">
                      {editingVendor ? 'Update Vendor' : 'Create Vendor'}
                    </button>
                    <button
                      onClick={resetVendorForm}
                      className="modern-button-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Parameter Prefix</th>
                      <th>Patterns</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorsLoading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8">
                          <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                          <p className="mt-2 text-gray-500 dark:text-gray-400">Loading vendors...</p>
                        </td>
                      </tr>
                    ) : vendorList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                          No vendors
                        </td>
                      </tr>
                    ) : (
                      vendorList.map((v) => (
                        <tr key={v.id}>
                          <td className="font-medium">{v.name}</td>
                          <td className="font-mono text-xs">{v.parameter_prefix || '-'}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {(v.manufacturer_patterns || []).concat(v.product_patterns || []).map((p, idx) => (
                                <span key={idx} className="modern-badge">{p}</span>
                              ))}
                            </div>
                          </td>
                          <td>{v.priority}</td>
                          <td>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${v.enabled ? 'modern-badge-success' : 'modern-badge-error'}`}>
                              {v.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingVendor(v)
                                  setCreatingVendor(true)
                                  setVendorForm({
                                    name: v.name,
                                    parameter_prefix: v.parameter_prefix || '',
                                    manufacturer_patterns: (v.manufacturer_patterns || []).join(','),
                                    product_patterns: (v.product_patterns || []).join(','),
                                    service_list_path: v.service_list_path || '',
                                    lan_binding_path: v.lan_binding_path || '',
                                    vlan_id_path: v.vlan_id_path || '',
                                    wifi_password_path: v.wifi_password_path || '',
                                    http_wan_enable_path: v.http_wan_enable_path || '',
                                    firewall_level_path: v.firewall_level_path || '',
                                    priority: v.priority,
                                    enabled: v.enabled,
                                    description: v.description || ''
                                  })
                                }}
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Edit"
                                aria-label="Edit"
                              >
                                <Icon name="edit" size={18} />
                              </button>
                              <button
                                onClick={() => deleteVendor(v.id)}
                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                title="Delete"
                                aria-label="Delete"
                              >
                                <Icon name="trash" size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WiFi Security Tab */}
        {activeTab === 'wifi-security' && (
          <div className="space-y-6">
            {/* WiFi Security Configs */}
            <div className="modern-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">WiFi Security Configuration</h2>
                <button
                  onClick={() => {
                    resetConfigForm();
                    setCreatingConfig(true);
                  }}
                  className="modern-button"
                >
                  + Add WiFi Config
                </button>
              </div>
              {(creatingConfig || editingConfig) && (
                <div className="mb-6 p-4 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Product Class</label>
                      <input
                        value={configForm.product_class}
                        onChange={(e) => setConfigForm(c => ({ ...c, product_class: e.target.value }))}
                        className="modern-input w-full"
                        placeholder="e.g. HG8245H"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Security Types (comma separated)</label>
                      <input
                        value={configForm.security_types}
                        onChange={(e) => setConfigForm(c => ({ ...c, security_types: e.target.value }))}
                        className="modern-input w-full"
                        placeholder="WPA2-PSK,WPA3-PSK"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Password Param Path</label>
                      <input
                        value={configForm.password_param_path}
                        onChange={(e) => setConfigForm(c => ({ ...c, password_param_path: e.target.value }))}
                        className="modern-input w-full font-mono"
                        placeholder="...KeyPassphrase"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={submitWifiConfig} className="modern-button">
                      {editingConfig ? 'Update Config' : 'Create Config'}
                    </button>
                    <button onClick={resetConfigForm} className="modern-button-secondary">Cancel</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="modern-table">
                  {/* Style Header Tabel Sesuai SS */}
                  <thead>
                    <tr>
                      <th className="uppercase">Product Class</th>
                      <th className="uppercase">Password Path</th>
                      <th className="uppercase">Security Types</th>
                      <th className="uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wifiConfigLoading ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">Loading configs...</td>
                      </tr>
                    ) : wifiConfigs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">No configs</td>
                      </tr>
                    ) : (
                      wifiConfigs.map(cfg => (
                        <tr key={cfg.id}>
                          <td className="font-medium">{cfg.product_class}</td>
                          <td className="font-mono text-xs">{cfg.password_param_path}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {(cfg.security_types_array || []).map((s, idx) => (
                                <span key={idx} className="modern-badge">{s}</span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  setEditingConfig(cfg);
                                  setCreatingConfig(false);
                                  setConfigForm({
                                    product_class: cfg.product_class,
                                    security_types: cfg.security_types,
                                    password_param_path: cfg.password_param_path
                                  })
                                }}
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteWifiConfig(cfg.id)}
                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'database' && (
              <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-lg">Database</CardTitle>
                      <Badge variant="secondary" className="font-mono">
                        {activeDb ? (activeDb.client === 'mysql2' ? `MySQL (${activeDb.database}@${activeDb.host})` : 'SQLite (local file)') : '…'}
                      </Badge>
                    </div>
                    <CardDescription>
                      Configure the active storage backend for panel settings, vendors, and topology.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="db-client">Type</Label>
                      <Select
                        value={dbForm.client}
                        onValueChange={(value) => setDbForm({ ...dbForm, client: value as DbConfigPayload['client'] })}
                      >
                        <SelectTrigger id="db-client">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="mysql2">MySQL / MariaDB</SelectItem>
                            <SelectItem value="sqlite3">SQLite (local file)</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                          {dbForm.client === 'mysql2' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="db-host">Host</Label>
                      <Input id="db-host" value={dbForm.host || ''} onChange={(e) => setDbForm({ ...dbForm, host: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="db-port">Port</Label>
                      <Input id="db-port" type="number" value={dbForm.port || 3306} onChange={(e) => setDbForm({ ...dbForm, port: Number(e.target.value) })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="db-user">User</Label>
                      <Input id="db-user" value={dbForm.user || ''} onChange={(e) => setDbForm({ ...dbForm, user: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="db-password">Password</Label>
                      <Input id="db-password" type="password" value={dbForm.password || ''} onChange={(e) => setDbForm({ ...dbForm, password: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2 sm:col-span-2">
                      <Label htmlFor="db-name">Database</Label>
                      <Input id="db-name" value={dbForm.database || ''} onChange={(e) => setDbForm({ ...dbForm, database: e.target.value })} />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2.5 text-sm text-foreground">
                  <Checkbox
                    checked={Boolean(dbForm.migrateData)}
                    onCheckedChange={(checked) => setDbForm({ ...dbForm, migrateData: Boolean(checked) })}
                  />
                  Copy existing data to the new database
                </label>

                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={handleDbTest} disabled={dbTesting}>
                    {dbTesting && <Spinner data-icon="inline-start" />}
                    {dbTesting ? 'Testing…' : 'Test Connection'}
                  </Button>
                  <Button type="button" onClick={handleDbSwitch} disabled={dbSwitching}>
                    {dbSwitching && <Spinner data-icon="inline-start" />}
                    {dbSwitching ? 'Switching…' : 'Switch Database'}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  After switching, restart the service (skygenpanel restart) for the change to take effect.
                </p>
              </CardContent>
            </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <CardTitle className="text-lg">Backup &amp; Restore</CardTitle>
                              <Badge variant="outline" className="font-mono text-xs">JSON Snapshot</Badge>
                            </div>
                            <CardDescription>
                              Ekspor seluruh data panel (pengaturan, vendor, topologi peta, titik lokasi device, akun pelanggan) atau restore dari file backup.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-5">
                            <div className="rounded-lg border border-border bg-muted/30 p-4">
                              <h3 className="text-sm font-semibold text-foreground">Backup Database</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Unduh salinan lengkap database aktif ke file <code className="font-mono">.json</code> untuk arsip atau migrasi antar instance.
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                className="mt-3"
                                disabled={exportingBackup || restoringBackup}
                                onClick={() => void handleExportBackup()}
                              >
                                {exportingBackup ? <Spinner data-icon="inline-start" /> : <Icon name="database" size={16} />}
                                {exportingBackup ? 'Membuat backup…' : 'Download Backup (.json)'}
                              </Button>
                            </div>

                            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                              <div>
                                <h3 className="text-sm font-semibold text-foreground">Restore Database</h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Pilih file backup <code className="font-mono">.json</code> yang diunduh dari SkyGenPanel.
                                </p>
                              </div>

                              <div className="flex flex-col gap-2">
                                <Label htmlFor="backup-file-input">File backup (.json)</Label>
                                <Input
                                  id="backup-file-input"
                                  type="file"
                                  accept=".json,application/json"
                                  disabled={restoringBackup}
                                  onChange={(e) => void handleBackupFileChange(e)}
                                />
                              </div>

                            {parsedBackup && (
                              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-mono font-semibold text-foreground">{backupFileName}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                      setParsedBackup(null)
                                      setBackupFileName('')
                                    }}
                                  >
                                    Clear
                                  </Button>
                                </div>
                                {parsedBackup.exportedAt && (
                                  <p className="mt-1 text-muted-foreground">
                                    Diekspor: {new Date(parsedBackup.exportedAt).toLocaleString('id-ID')}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap gap-1.5 font-mono">
                                  <Badge variant="secondary">
                                    settings {Array.isArray(parsedBackup.tables?.settings) ? parsedBackup.tables.settings.length : 0}
                                  </Badge>
                                  <Badge variant="secondary">
                                    vendors {Array.isArray(parsedBackup.tables?.vendors) ? parsedBackup.tables.vendors.length : 0}
                                  </Badge>
                                  <Badge variant="secondary">
                                    nodes {Array.isArray(parsedBackup.tables?.mapping_nodes) ? parsedBackup.tables.mapping_nodes.length : 0}
                                  </Badge>
                                  <Badge variant="secondary">
                                    edges {Array.isArray(parsedBackup.tables?.mapping_edges) ? parsedBackup.tables.mapping_edges.length : 0}
                                  </Badge>
                                  <Badge variant="secondary">
                                    devices {Array.isArray(parsedBackup.tables?.device_profiles) ? parsedBackup.tables.device_profiles.length : 0}
                                  </Badge>
                                  <Badge variant="secondary">
                                    customers {Array.isArray(parsedBackup.tables?.customer_accounts) ? parsedBackup.tables.customer_accounts.length : 0}
                                  </Badge>
                                  <Badge variant="secondary">
                                    users {Array.isArray(parsedBackup.tables?.users) ? parsedBackup.tables.users.length : 0}
                                  </Badge>
                                </div>
                              </div>
                            )}

                            <label className="flex items-center gap-2.5 text-sm text-foreground">
                              <Checkbox
                                checked={preserveCurrentAdmin}
                                onCheckedChange={(checked) => setPreserveCurrentAdmin(Boolean(checked))}
                              />
                              Pertahankan akun login admin saat ini (jangan timpa user)
                            </label>

                        <Button
                          type="button"
                          disabled={!parsedBackup || restoringBackup || exportingBackup}
                          onClick={handleRestoreBackup}
                        >
                          {restoringBackup ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} />}
                          {restoringBackup ? 'Merestore…' : 'Restore Database'}
                        </Button>
                      </div>
              </CardContent>
                </Card>
              </div>
        )}

              {/* Save Button */}
              {(activeTab === 'general' || activeTab === 'virtual-params' || activeTab === 'customer-portal') && (
                <div className="mt-8 flex justify-end">
                  <Button onClick={handleSaveSettings} disabled={loading} className="w-full sm:w-auto">
                    {loading && <Spinner data-icon="inline-start" />}
                    {loading ? 'Saving…' : 'Save Settings'}
                  </Button>
                </div>
              )}

              <AlertDialog open={Boolean(confirmState)} onOpenChange={(open) => { if (!open) setConfirmState(null) }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
                    <AlertDialogDescription>{confirmState?.description}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const action = confirmState?.onConfirm
                        setConfirmState(null)
                        if (action) void action()
                      }}
                    >
                      {confirmState?.actionLabel || 'Continue'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )
        }

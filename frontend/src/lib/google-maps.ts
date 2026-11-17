let googleMapsPromise: Promise<any> | null = null
let loadedApiKey = ''

export type GoogleMapMode = 'roadmap' | 'hybrid'

export const CLEAN_ROADMAP_STYLES = [
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text',
    stylers: [{ visibility: 'on' }],
  },
]

export const CLEAN_ROADMAP_DARK_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4b5563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  ...CLEAN_ROADMAP_STYLES,
]

export function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function loadGoogleMapsApi(apiKey: string): Promise<any> {
  const key = apiKey.trim()
  if (!key) {
    return Promise.reject(new Error('Google Maps API key is empty'))
  }
  const win = window as any
  if (win.google?.maps && loadedApiKey === key) {
    return Promise.resolve(win.google.maps)
  }
  if (googleMapsPromise && loadedApiKey === key) {
    return googleMapsPromise
  }

  loadedApiKey = key
  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-skygenpanel-gmaps="1"]')
    if (existing) {
      existing.remove()
    }
    const script = document.createElement('script')
    script.dataset.skygenpanelGmaps = '1'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=id&region=ID`
    script.async = true
    script.defer = true
    script.onload = () => {
      if (win.google?.maps) {
        resolve(win.google.maps)
      } else {
        googleMapsPromise = null
        reject(new Error('Google Maps API loaded without window.google.maps'))
      }
    }
    script.onerror = () => {
      googleMapsPromise = null
      reject(new Error('Failed to load Google Maps JavaScript API'))
    }
    document.head.appendChild(script)
  })

  return googleMapsPromise
}

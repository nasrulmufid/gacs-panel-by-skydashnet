let googleMapsPromise: Promise<any> | null = null
let loadedApiKey = ''

export type GoogleMapMode = 'hybrid' | 'roadmap'

export const CLEAN_ROADMAP_STYLES = [
  {
    featureType: 'poi.business',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
]

export const CLEAN_ROADMAP_DARK_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1b2430' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#172822' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#243040' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#163024' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c354d' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7dd3fc' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#f1f5f9' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#e2e8f0' }] },
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

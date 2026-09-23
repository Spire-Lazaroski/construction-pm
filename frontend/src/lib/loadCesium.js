// Loads Cesium (script + widget CSS) the first time the 3D view is opened.
let promise = null
export default function loadCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium)
  if (promise) return promise
  const base = (import.meta.env.BASE_URL || '/') + 'cesium/'
  window.CESIUM_BASE_URL = base
  promise = new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = base + 'Widgets/widgets.css'
    document.head.appendChild(css)
    const s = document.createElement('script')
    s.src = base + 'Cesium.js'
    s.onload = () => resolve(window.Cesium)
    s.onerror = () => { promise = null; reject(new Error('Cesium failed to load')) }
    document.head.appendChild(s)
  })
  return promise
}

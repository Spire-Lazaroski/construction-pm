import React, { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { useT } from '../lib/i18n.jsx'

export default function ProjectFlythrough({ project, onClose }) {
  const containerRef = useRef(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)
  const { t } = useT()

  useEffect(() => {
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (!token) {
      setError('No Cesium ion token configured — add VITE_CESIUM_ION_TOKEN to frontend/.env (free at cesium.com/ion).')
      return
    }
    Cesium.Ion.defaultAccessToken = token

    let viewer
    let cancelled = false
    const note = (m) => { if (!cancelled) setStatus(m) }

    async function init() {
      // Start from things that cannot fail: a smooth ellipsoid and Esri satellite imagery
      // (no key needed, same source as the "Satellite" map). Ion terrain and Google 3D
      // buildings are layered on afterwards when they load. Passing `terrain:` directly
      // leaves the globe EMPTY (stars only) if the ion request fails.
      viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: false, // added below once loaded, so a slow/blocked source can't blank the globe
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        timeline: false,
        animation: false,
        fullscreenButton: true,
      })
      viewer.scene.globe.depthTestAgainstTerrain = true
      Cesium.ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer')
        .catch(() => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }))
        .then((provider) => { if (!cancelled) viewer.imageryLayers.addImageryProvider(provider, 0) })

      const lon = parseFloat(project.longitude), lat = parseFloat(project.latitude)
      const flyTo = (groundHeight) => viewer.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, groundHeight), 120),
        { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 650), duration: 3 })

      let ground = 0
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1)
        if (cancelled) return
        viewer.terrainProvider = terrain
        const [pos] = await Cesium.sampleTerrainMostDetailed(terrain, [Cesium.Cartographic.fromDegrees(lon, lat)])
        ground = pos?.height || 0
      } catch (e) {
        console.warn('Cesium World Terrain unavailable:', e)
        note('terrain')
      }
      if (cancelled) return

      try {
        const tileset = await Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true })
        if (cancelled) return
        viewer.scene.primitives.add(tileset)
        viewer.scene.globe.show = false // the tiles include their own ground
      } catch (e) {
        console.warn('Photorealistic 3D tiles unavailable, using terrain/imagery view instead:', e)
      }
      if (!cancelled) flyTo(ground)
    }
    init().catch((e) => { console.error(e); note('failed') })

    return () => {
      cancelled = true
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
    }
  }, [project.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[80vh] bg-ink-900 rounded-xl2 overflow-hidden shadow-pop">
        <div className="absolute top-3 left-4 z-10 text-white pointer-events-none">
          <div className="text-xs text-blueprint-200">3D</div>
          <div className="font-semibold">{project.name}</div>
        </div>
        <button onClick={onClose} className="absolute top-3 right-4 z-10 text-white text-lg leading-none hover:text-blueprint-300">✕</button>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm p-6 text-center">
            {error}
          </div>
        )}
        {status && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-xs text-white/80 bg-black/50 rounded px-3 py-1.5">
            {t(status === 'terrain' ? 'fly.noTerrain' : 'fly.failed')}
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}

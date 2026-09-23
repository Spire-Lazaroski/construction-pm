import React, { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'

export default function ProjectFlythrough({ project, onClose }) {
  const containerRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (!token) {
      setError('No Cesium ion token configured — add VITE_CESIUM_ION_TOKEN to frontend/.env (free at cesium.com/ion).')
      return
    }
    Cesium.Ion.defaultAccessToken = token

    let viewer
    let cancelled = false

    async function init() {
      viewer = new Cesium.Viewer(containerRef.current, {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        timeline: false,
        animation: false,
      })

      // Photorealistic 3D tiles are a nice-to-have — if the ion account isn't
      // eligible or the service is briefly unavailable, fall back quietly to
      // the terrain + imagery view instead of breaking the whole viewer.
      try {
        const tileset = await Cesium.createGooglePhotorealistic3DTileset()
        if (!cancelled) viewer.scene.primitives.add(tileset)
      } catch (e) {
        console.warn('Photorealistic 3D tiles unavailable, using terrain/imagery view instead:', e)
      }

      if (cancelled) return
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          parseFloat(project.longitude), parseFloat(project.latitude), 400
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-35),
        },
        duration: 3,
      })
    }
    init()

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
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

// vite-plugin-cesium copies Cesium's assets and maps `import 'cesium'` to the global
// `window.Cesium`, but it also injects Cesium.js (several MB) into EVERY page load.
// We remove that injection; the 3D view loads the script on demand (lib/loadCesium.js).
function lazyCesium() {
  return {
    name: 'lazy-cesium',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/\s*<link rel="stylesheet" href="[^"]*cesium\/Widgets\/widgets\.css">/, '')
          .replace(/\s*<script src="[^"]*cesium\/Cesium\.js"><\/script>/, '')
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), cesium(), lazyCesium()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          maps: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
})

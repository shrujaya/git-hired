import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite binds to localhost by default, which inside a container means only
    // the container itself - the published port would connect to nothing.
    host: true,
    watch: {
      // Bind-mounted source on Docker Desktop (macOS/Windows) does not deliver
      // filesystem events to the container, so the default watcher sees no
      // edits and hot reload quietly stops working. Polling costs CPU, so it
      // is opt-in: docker-compose sets VITE_USE_POLLING, native `npm run dev`
      // does not.
      usePolling: Boolean(process.env.VITE_USE_POLLING),
    },
  },
})

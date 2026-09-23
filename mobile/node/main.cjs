'use strict'
/**
 * Entry point for the embedded Node.js runtime in the Errata Android app.
 *
 * Boots the same Nitro server bundle the desktop and binary builds use, bound to
 * loopback, and tells the WebView loader page (mobile/shell/index.html) where to
 * navigate once /api/health answers. Messages travel over the plugin's bridge:
 *
 *   loader -> node   'errata:status'   ask for the current state
 *   node -> loader   'errata:status'   { status: 'starting' | 'ready' | 'error', url?, message? }
 */
// Requiring `bridge` first is what marks the runtime as ready on the Capacitor side.
const { app, channel } = require('bridge')
const { installPolyfills, buildServerEnv, serverUrl, waitForHealth, DEFAULT_PORT } = require('./boot.cjs')

installPolyfills()

const env = buildServerEnv(app.datadir(), DEFAULT_PORT)
Object.assign(process.env, env)

let state = { status: 'starting' }

function announce() {
  channel.post('errata:status', state)
}

channel.on('errata:status', announce)

// The runtime cannot be restarted within an app launch, so never let a stray
// rejection take it down. Log and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[android] unhandled rejection:', reason)
})
process.on('uncaughtException', (error) => {
  console.error('[android] uncaught exception:', error)
})

// Android may pause the runtime while the app is backgrounded. Nothing here needs
// to finish before that happens; in-flight generations resume with the app.
app.on('pause', (pauseLock) => {
  pauseLock.release()
})

async function boot() {
  try {
    await import('./server/index.mjs')
    await waitForHealth({ port: DEFAULT_PORT })
    state = { status: 'ready', url: serverUrl(DEFAULT_PORT) }
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.error('[android] server failed to start:', message)
    state = { status: 'error', message }
  }
  announce()
}

void boot()

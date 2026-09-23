/// <reference types="@capawesome/capacitor-nodejs" />
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android shell for Errata. The WebView boots from mobile/www (a small loader page)
 * while the real app, the Nitro server bundle, runs on-device inside the embedded
 * Node.js runtime and is reached over loopback. See docs/android.md.
 */
const config: CapacitorConfig = {
  appId: 'com.tealios.errata',
  appName: 'Errata',
  webDir: 'mobile/www',
  android: {
    path: 'android',
    // Warm parchment so the first paint is not a white flash. Matches the desktop shell.
    backgroundColor: '#efe7d6',
  },
  server: {
    androidScheme: 'https',
    // The loader hands the WebView off to the on-device server; keep that inside the app.
    allowNavigation: ['127.0.0.1'],
  },
  plugins: {
    Nodejs: {
      nodeDir: 'nodejs',
      startMode: 'auto',
    },
  },
}

export default config

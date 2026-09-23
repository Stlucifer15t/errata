'use strict'
/**
 * Pure helpers for booting the Errata server inside the embedded Node.js runtime on
 * Android. Kept free of the `bridge` module so they can be unit-tested on a desktop.
 *
 * The runtime is Node.js for Mobile Apps (18.x), so a couple of newer globals the
 * Nitro/Elysia bundle relies on are polyfilled here before the bundle is imported.
 */
const http = require('node:http')
const { webcrypto } = require('node:crypto')
const { join } = require('node:path')

const DEFAULT_PORT = 7739
const LOOPBACK = '127.0.0.1'

/** Install polyfills the server bundle needs on Node 18. Idempotent. */
function installPolyfills(target = globalThis) {
  const PromiseCtor = target.Promise ?? Promise
  if (typeof PromiseCtor.withResolvers !== 'function') {
    PromiseCtor.withResolvers = function withResolvers() {
      let resolve
      let reject
      const promise = new this((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }
  if (typeof target.crypto === 'undefined') {
    target.crypto = webcrypto
  }
  return target
}

/**
 * Environment for the server process. Everything persistent lives under the
 * app's private data directory (the Node project directory itself is replaced on
 * app updates). The server binds to loopback only; nothing is exposed on the LAN
 * unless the user turns on sharing inside the app.
 */
function buildServerEnv(dataRoot, port = DEFAULT_PORT) {
  if (typeof dataRoot !== 'string' || dataRoot.length === 0) {
    throw new Error('buildServerEnv: dataRoot is required')
  }
  const portString = String(port)
  return {
    NODE_ENV: 'production',
    DATA_DIR: join(dataRoot, 'data'),
    PLUGIN_DIR: join(dataRoot, 'plugins'),
    HOST: LOOPBACK,
    PORT: portString,
    NITRO_HOST: LOOPBACK,
    NITRO_PORT: portString,
    ERRATA_PLATFORM: 'android',
  }
}

function serverUrl(port = DEFAULT_PORT) {
  return `http://${LOOPBACK}:${port}/`
}

/** Poll /api/health until it answers 200 or the deadline passes. */
function waitForHealth({ port = DEFAULT_PORT, host = LOOPBACK, timeoutMs = 60_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Errata server did not become healthy within ${timeoutMs}ms`))
        return
      }
      setTimeout(attempt, intervalMs)
    }
    const attempt = () => {
      const req = http.get({ host, port, path: '/api/health', timeout: 2_000 }, (res) => {
        res.resume()
        if (res.statusCode === 200) {
          resolve()
        } else {
          retry()
        }
      })
      req.on('error', retry)
      req.on('timeout', () => req.destroy(new Error('timeout')))
    }
    attempt()
  })
}

module.exports = { DEFAULT_PORT, LOOPBACK, installPolyfills, buildServerEnv, serverUrl, waitForHealth }

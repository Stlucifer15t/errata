'use strict'
/**
 * Pure helpers for booting the Errata server inside the embedded Node.js runtime on
 * Android. Kept free of the `bridge` module so they can be unit-tested on a desktop.
 *
 * The runtime is Node.js for Mobile Apps (18.x, built without full ICU), so a few
 * things the Nitro/Elysia bundle relies on are polyfilled here before the bundle is
 * imported.
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
  installRegExpFallback(target)
  return target
}

/**
 * Rewrite Unicode property escapes (`\p{Emoji}`, `\P{Letter}`) into plain ranges.
 * Inside a character class the replacement is a bare range; outside it is wrapped
 * in its own class. Escaped characters are skipped so `\\p` stays literal.
 */
function stripPropertyEscapes(source) {
  let out = ''
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      const next = source[i + 1]
      if ((next === 'p' || next === 'P') && source[i + 2] === '{') {
        const close = source.indexOf('}', i + 3)
        if (close !== -1) {
          const negated = next === 'P'
          const range = negated ? '\\x00-\\x7F' : '\\u0080-\\u{10FFFF}'
          out += inClass ? range : `[${range}]`
          i = close
          continue
        }
      }
      out += ch + (next ?? '')
      i++
      continue
    }
    if (ch === '[' && !inClass) inClass = true
    else if (ch === ']' && inClass) inClass = false
    out += ch
  }
  return out
}

/**
 * V8 without ICU rejects `\p{...}` with "Invalid property name". Several server
 * dependencies build such patterns with `new RegExp(...)` at import time (the
 * OpenAPI plugin's emoji format, for one), which would take the whole bundle down.
 * When the runtime lacks support, wrap the constructor so those patterns degrade to
 * "any non-ASCII" instead of throwing. Returns true when the fallback was installed.
 */
function installRegExpFallback(target = globalThis) {
  const Native = target.RegExp
  if (typeof Native !== 'function') return false
  try {
    new Native('\\p{L}', 'u')
    return false
  } catch {
    // fall through: property escapes unsupported
  }
  if (Native.__errataFallback) return false

  const Patched = function RegExp(pattern, flags) {
    try {
      return new Native(pattern, flags)
    } catch (error) {
      const source = pattern instanceof Native ? pattern.source : pattern
      if (error instanceof SyntaxError && typeof source === 'string' && /\\[pP]\{/.test(source)) {
        const resolvedFlags = flags ?? (pattern instanceof Native ? pattern.flags : undefined)
        return new Native(stripPropertyEscapes(source), resolvedFlags)
      }
      throw error
    }
  }
  Patched.prototype = Native.prototype
  Object.setPrototypeOf(Patched, Native)
  Object.defineProperty(Patched, '__errataFallback', { value: true })
  target.RegExp = Patched
  return true
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

module.exports = {
  DEFAULT_PORT,
  LOOPBACK,
  installPolyfills,
  installRegExpFallback,
  stripPropertyEscapes,
  buildServerEnv,
  serverUrl,
  waitForHealth,
}

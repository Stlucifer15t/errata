import { describe, expect, it, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface BootModule {
  DEFAULT_PORT: number
  installPolyfills: (target?: object) => object
  buildServerEnv: (dataRoot: string, port?: number) => Record<string, string>
  serverUrl: (port?: number) => string
  waitForHealth: (opts?: { port?: number; host?: string; timeoutMs?: number; intervalMs?: number }) => Promise<void>
}

const boot = require('../../mobile/node/boot.cjs') as BootModule

describe('android boot helpers', () => {
  describe('installPolyfills', () => {
    it('adds Promise.withResolvers and a global crypto when missing', async () => {
      class FakePromise<T> extends Promise<T> {}
      const target: Record<string, unknown> = { Promise: FakePromise }
      boot.installPolyfills(target)

      const withResolvers = (
        FakePromise as unknown as {
          withResolvers: () => { promise: Promise<number>; resolve: (v: number) => void }
        }
      ).withResolvers
      expect(typeof withResolvers).toBe('function')
      const { promise, resolve } = withResolvers.call(FakePromise)
      resolve(7)
      await expect(promise).resolves.toBe(7)

      const cryptoLike = target.crypto as { randomUUID: () => string }
      expect(typeof cryptoLike.randomUUID).toBe('function')
    })

    it('leaves existing implementations alone', () => {
      const existing = { withResolvers: () => 'mine' }
      const cryptoSentinel = { randomUUID: () => 'x' }
      const target = { Promise: existing, crypto: cryptoSentinel }
      boot.installPolyfills(target)
      expect(target.Promise.withResolvers()).toBe('mine')
      expect(target.crypto).toBe(cryptoSentinel)
    })
  })

  describe('buildServerEnv', () => {
    it('points storage under the app data root and binds to loopback', () => {
      const root = '/data/user/0/com.tealios.errata/files'
      const env = boot.buildServerEnv(root, 7739)
      expect(env.DATA_DIR).toBe(join(root, 'data'))
      expect(env.PLUGIN_DIR).toBe(join(root, 'plugins'))
      expect(env.HOST).toBe('127.0.0.1')
      expect(env.NITRO_HOST).toBe('127.0.0.1')
      expect(env.PORT).toBe('7739')
      expect(env.NITRO_PORT).toBe('7739')
      expect(env.NODE_ENV).toBe('production')
      expect(env.ERRATA_PLATFORM).toBe('android')
    })

    it('rejects a missing data root instead of writing next to the bundle', () => {
      expect(() => boot.buildServerEnv('')).toThrow()
    })
  })

  describe('serverUrl', () => {
    it('is a loopback http URL', () => {
      expect(boot.serverUrl(7739)).toBe('http://127.0.0.1:7739/')
    })
  })

  describe('waitForHealth', () => {
    let server: Server | null = null
    afterEach(async () => {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = null
    })

    it('resolves once /api/health answers 200, tolerating early failures', async () => {
      let calls = 0
      server = createServer((req, res) => {
        calls++
        if (req.url === '/api/health' && calls >= 3) {
          res.writeHead(200).end('{"status":"ok"}')
        } else {
          res.writeHead(503).end()
        }
      })
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
      const port = (server.address() as { port: number }).port

      await expect(boot.waitForHealth({ port, timeoutMs: 5_000, intervalMs: 10 })).resolves.toBeUndefined()
      expect(calls).toBeGreaterThanOrEqual(3)
    })

    it('rejects when nothing is listening before the deadline', async () => {
      await expect(boot.waitForHealth({ port: 1, timeoutMs: 200, intervalMs: 20 })).rejects.toThrow(
        /did not become healthy/,
      )
    })
  })
})

// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Node's experimental `localStorage` global shadows jsdom's with `undefined`
// unless --localstorage-file is set; theme.tsx touches localStorage at module
// load, so install an in-memory stand-in before the import graph resolves.
vi.hoisted(() => {
  const store = new Map<string, string>()
  const stub: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true })
})
import {
  DEFAULT_TRANSFORMS,
  mergeDefaultTransforms,
  useWritingTransforms,
  type WritingTransform,
} from '@/lib/theme'

const STORAGE_KEY = 'errata-writing-transforms'
const SEEN_KEY = 'errata-writing-transforms-seen-defaults'

function t(id: string, overrides: Partial<WritingTransform> = {}): WritingTransform {
  return { id, label: id, instruction: `do ${id}`, enabled: true, ...overrides }
}

const defaults = [t('alpha'), t('beta'), t('gamma')]

describe('DEFAULT_TRANSFORMS', () => {
  it('includes a fix-grammar transform that preserves style', () => {
    const fixGrammar = DEFAULT_TRANSFORMS.find((tr) => tr.id === 'fix-grammar')
    expect(fixGrammar).toBeDefined()
    expect(fixGrammar!.enabled).toBe(true)
    expect(fixGrammar!.label).toBe('Fix grammar')
    expect(fixGrammar!.instruction.toLowerCase()).toContain('grammar')
    expect(fixGrammar!.instruction.toLowerCase()).toContain('style')
  })
})

describe('mergeDefaultTransforms', () => {
  it('returns the defaults wholesale for a fresh install and marks them all seen', () => {
    const { transforms, seenIds } = mergeDefaultTransforms(null, [], defaults)
    expect(transforms).toEqual(defaults)
    expect(seenIds).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('appends a new default an existing user has never been offered', () => {
    const stored = [t('alpha'), t('beta')]
    const { transforms, seenIds } = mergeDefaultTransforms(stored, ['alpha', 'beta'], defaults)
    expect(transforms.map((tr) => tr.id)).toEqual(['alpha', 'beta', 'gamma'])
    expect(seenIds).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('does not resurrect a default the user deleted', () => {
    const stored = [t('alpha'), t('gamma')] // user deleted beta after seeing it
    const { transforms } = mergeDefaultTransforms(stored, ['alpha', 'beta', 'gamma'], defaults)
    expect(transforms.map((tr) => tr.id)).toEqual(['alpha', 'gamma'])
  })

  it('preserves user reordering and edits when appending', () => {
    const stored = [t('beta', { label: 'My beta', enabled: false }), t('alpha')]
    const { transforms } = mergeDefaultTransforms(stored, ['alpha', 'beta'], defaults)
    expect(transforms.map((tr) => tr.id)).toEqual(['beta', 'alpha', 'gamma'])
    expect(transforms[0]).toEqual(t('beta', { label: 'My beta', enabled: false }))
  })

  it('leaves custom user transforms untouched', () => {
    const stored = [t('alpha'), t('my-custom')]
    const { transforms } = mergeDefaultTransforms(stored, ['alpha', 'beta', 'gamma'], defaults)
    expect(transforms.map((tr) => tr.id)).toEqual(['alpha', 'my-custom'])
  })

  it('changes nothing when everything is already present', () => {
    const stored = [t('alpha'), t('beta'), t('gamma')]
    const { transforms } = mergeDefaultTransforms(stored, [], defaults)
    expect(transforms).toBe(stored)
  })
})

describe('useWritingTransforms migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('offers all defaults, including fix-grammar, with empty localStorage', () => {
    const { result } = renderHook(() => useWritingTransforms())
    const [transforms] = result.current
    expect(transforms.some((tr) => tr.id === 'fix-grammar')).toBe(true)
    expect(transforms).toEqual(DEFAULT_TRANSFORMS)
  })

  it('appends fix-grammar to a pre-existing stored list that lacks it, and persists', () => {
    const stored = DEFAULT_TRANSFORMS.filter((tr) => tr.id !== 'fix-grammar')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    const { result } = renderHook(() => useWritingTransforms())
    const [transforms] = result.current
    expect(transforms.some((tr) => tr.id === 'fix-grammar')).toBe(true)
    expect(transforms).toHaveLength(DEFAULT_TRANSFORMS.length)

    // The merged list is written back so the addition survives reloads
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(persisted.some((tr: WritingTransform) => tr.id === 'fix-grammar')).toBe(true)
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY)!)
    expect(seen).toContain('fix-grammar')
  })

  it('does not bring back a default the user deleted', () => {
    const stored = DEFAULT_TRANSFORMS.filter((tr) => tr.id !== 'fix-grammar')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    localStorage.setItem(SEEN_KEY, JSON.stringify(DEFAULT_TRANSFORMS.map((tr) => tr.id)))

    const { result } = renderHook(() => useWritingTransforms())
    const [transforms] = result.current
    expect(transforms.some((tr) => tr.id === 'fix-grammar')).toBe(false)
  })
})

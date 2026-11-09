import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fragment } from '../../src/server/fragments/schema'

const { listGlobalFragments, makeFragmentGlobal, removeGlobalFragment, getGlobalFragment } = await import('../../src/server/fragments/global-fragments')

function makeFragment(overrides: Partial<Fragment> = {}): Fragment {
  const now = new Date().toISOString()
  return {
    id: 'char-test1234',
    type: 'character',
    name: 'Test Character',
    description: 'A test',
    content: 'Test content',
    tags: [],
    refs: [],
    sticky: false,
    placement: 'user',
    createdAt: now,
    updatedAt: now,
    order: 0,
    meta: {},
    ...overrides,
  }
}

describe('global fragments storage', () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'errata-global-'))
  })

  it('starts empty', async () => {
    expect(await listGlobalFragments(dataDir)).toEqual([])
  })

  it('copies a fragment into the pool and lists it', async () => {
    const fragment = makeFragment()
    const copy = await makeFragmentGlobal(dataDir, fragment)
    expect(copy.meta.global).toBe(true)

    const all = await listGlobalFragments(dataDir)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('char-test1234')
    expect(all[0].name).toBe('Test Character')

    const byType = await listGlobalFragments(dataDir, 'character')
    expect(byType).toHaveLength(1)
    expect(await listGlobalFragments(dataDir, 'knowledge')).toEqual([])
  })

  it('is idempotent per id', async () => {
    const fragment = makeFragment({ name: 'v1' })
    await makeFragmentGlobal(dataDir, fragment)
    await makeFragmentGlobal(dataDir, { ...fragment, name: 'v2' })
    const all = await listGlobalFragments(dataDir)
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('v2')
  })

  it('getGlobalFragment finds by id across types', async () => {
    await makeFragmentGlobal(dataDir, makeFragment())
    const found = await getGlobalFragment(dataDir, 'char-test1234')
    expect(found?.type).toBe('character')
    expect(await getGlobalFragment(dataDir, 'char-nothere')).toBeNull()
  })

  it('removeGlobalFragment deletes only the global copy', async () => {
    await makeFragmentGlobal(dataDir, makeFragment())
    expect(await removeGlobalFragment(dataDir, 'character', 'char-test1234')).toBe(true)
    expect(await listGlobalFragments(dataDir)).toEqual([])
    expect(await removeGlobalFragment(dataDir, 'character', 'char-test1234')).toBe(false)
  })
})

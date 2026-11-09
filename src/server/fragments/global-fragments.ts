/**
 * Global fragments — fragments that apply across every story.
 *
 * Stored under `<DATA_DIR>/global-fragments/<type>/<id>.json`, outside any
 * story directory, so they survive story deletion and are visible to every
 * story's context builder. A fragment becomes global by copying it into this
 * pool (with `meta.global = true`); the story-level original is untouched.
 *
 * The copy keeps the same id as its source so "make global / make local"
 * stays idempotent and remapping references is trivial.
 */
import { join } from 'node:path'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { FragmentSchema, type Fragment } from './schema'

function globalFragmentsRoot(dataDir: string) {
  return join(dataDir, 'global-fragments')
}

async function typeDir(dataDir: string, type: string) {
  const dir = join(globalFragmentsRoot(dataDir), type)
  await mkdir(dir, { recursive: true })
  return dir
}

function readFragmentFile(path: string): Fragment | null {
  if (!existsSync(path)) return null
  try {
    // Synchronous read: small files, called in a loop — keeps the helper simple.
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const parsed = FragmentSchema.safeParse(raw)
    return parsed.success ? (parsed.data as Fragment) : null
  } catch {
    return null
  }
}

/** List all global fragments, optionally filtered by type. */
export async function listGlobalFragments(dataDir: string, type?: string): Promise<Fragment[]> {
  const root = globalFragmentsRoot(dataDir)
  if (!existsSync(root)) return []

  const types = type
    ? [type]
    : (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)

  const out: Fragment[] = []
  for (const t of types) {
    const dir = join(root, t)
    if (!existsSync(dir)) continue
    for (const entry of await readdir(dir)) {
      if (!entry.endsWith('.json')) continue
      const fragment = readFragmentFile(join(dir, entry))
      if (fragment && !fragment.archived) out.push(fragment)
    }
  }
  return out
}

/** Copy a fragment into the global pool. Idempotent per id. */
export async function makeFragmentGlobal(dataDir: string, fragment: Fragment): Promise<Fragment> {
  const dir = await typeDir(dataDir, fragment.type)
  const globalCopy: Fragment = {
    ...fragment,
    archived: false,
    meta: { ...fragment.meta, global: true },
  }
  await writeFile(join(dir, `${fragment.id}.json`), JSON.stringify(globalCopy, null, 2))
  return globalCopy
}

/** Remove a fragment from the global pool. Returns true when something was removed. */
export async function removeGlobalFragment(dataDir: string, type: string, fragmentId: string): Promise<boolean> {
  const path = join(globalFragmentsRoot(dataDir), type, `${fragmentId}.json`)
  if (!existsSync(path)) return false
  await rm(path)
  return true
}

/** Get one global fragment by id (any type). */
export async function getGlobalFragment(dataDir: string, fragmentId: string): Promise<Fragment | null> {
  const all = await listGlobalFragments(dataDir)
  return all.find((f) => f.id === fragmentId) ?? null
}

import { describe, expect, it } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The server bundle has to run under plain Node.js as well as Bun: the Electron
 * desktop build ships a Bun binary, but the Android build embeds the same Nitro
 * output in a Node.js runtime where `Bun` does not exist.
 */
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      files.push(...(await walk(full)))
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

describe('server portability', () => {
  it('does not use Bun-only globals in server or bundled plugin code', async () => {
    const files = [...(await walk('src/server')), ...(await walk('plugins'))]
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (/\bBun\.[a-zA-Z]/.test(source) || /from ['"]bun(:|['"])/.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

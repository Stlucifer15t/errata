import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTempDir, makeTestSettings } from '../setup'
import { createApp } from '@/server/api'
import { createStory } from '@/server/fragments/storage'
import { agentBlockRegistry } from '@/server/agents/agent-block-registry'
import { getAgentBlockConfig, saveAgentBlockConfig, type AgentBlockConfig } from '@/server/agents/agent-block-storage'
import type { StoryMeta } from '@/server/fragments/schema'

const SOURCE = 'story-src'
const TARGET = 'story-tgt'

function makeStory(id: string): StoryMeta {
  const now = new Date().toISOString()
  return { id, name: id, description: '', coverImage: null, summary: '', createdAt: now, updatedAt: now, settings: makeTestSettings() }
}

function makeAgentConfig(overrides: Partial<AgentBlockConfig> = {}): AgentBlockConfig {
  return {
    customBlocks: [
      { id: 'cb-voice1', name: 'Voice', role: 'system', order: 10, enabled: true, type: 'simple', content: 'Close third person.' },
    ],
    overrides: {},
    blockOrder: ['cb-voice1'],
    disabledTools: [],
    disableAutoAnalysis: false,
    ...overrides,
  }
}

const scriptBlock = { id: 'cb-dyn001', name: 'Dynamic', role: 'system', order: 20, enabled: true, type: 'script', content: 'return "x"' } as const

describe('whole agent-config export/import between stories', () => {
  let dataDir: string
  let cleanup: () => Promise<void>
  let app: ReturnType<typeof createApp>

  const call = (path: string, init?: RequestInit) => app.fetch(new Request(`http://localhost/api${path}`, init))
  const post = (path: string, body: unknown) =>
    call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  beforeEach(async () => {
    const tmp = await createTempDir()
    dataDir = tmp.path
    cleanup = tmp.cleanup
    app = createApp(dataDir)

    agentBlockRegistry.register({
      agentName: 'test-agent', displayName: 'Test Agent', description: 'stub',
      createDefaultBlocks: () => [], buildPreviewContext: async () => ({}) as never,
    })
    agentBlockRegistry.register({
      agentName: 'other-agent', displayName: 'Other Agent', description: 'stub',
      createDefaultBlocks: () => [], buildPreviewContext: async () => ({}) as never,
    })

    await createStory(dataDir, makeStory(SOURCE))
    await createStory(dataDir, makeStory(TARGET))
  })

  afterEach(async () => {
    await cleanup()
  })

  it('exports every configured agent as a portable bundle', async () => {
    await saveAgentBlockConfig(dataDir, SOURCE, 'test-agent', makeAgentConfig())
    await saveAgentBlockConfig(dataDir, SOURCE, 'other-agent', makeAgentConfig({
      customBlocks: [], blockOrder: [], disabledTools: ['someTool'],
    }))

    const res = await call(`/stories/${SOURCE}/agent-config/export`)
    expect(res.status).toBe(200)
    const bundle = await res.json()
    expect(bundle._errata).toBe('agent-config-bundle')
    expect(bundle.version).toBe(1)
    expect(Object.keys(bundle.agentBlockConfigs)).toEqual(
      expect.arrayContaining(['test-agent', 'other-agent']),
    )
    expect(bundle.agentBlockConfigs['test-agent'].customBlocks).toHaveLength(1)
  })

  it('skips untouched agents in the export', async () => {
    await saveAgentBlockConfig(dataDir, SOURCE, 'test-agent', makeAgentConfig())

    const res = await call(`/stories/${SOURCE}/agent-config/export`)
    const bundle = await res.json()
    expect(bundle.agentBlockConfigs['other-agent']).toBeUndefined()
  })

  it('404s exporting a missing story', async () => {
    const res = await call('/stories/nope/agent-config/export')
    expect(res.status).toBe(404)
  })

  it('round-trips: an exported bundle imports into another story', async () => {
    await saveAgentBlockConfig(dataDir, SOURCE, 'test-agent', makeAgentConfig())
    const bundle = await (await call(`/stories/${SOURCE}/agent-config/export`)).json()

    const res = await post(`/stories/${TARGET}/agent-config/import`, { bundle })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied.agentsApplied).toContain('test-agent')

    const imported = await getAgentBlockConfig(dataDir, TARGET, 'test-agent')
    expect(imported.customBlocks).toHaveLength(1)
    expect(imported.customBlocks[0].content).toBe('Close third person.')
  })

  it('refuses a bundle with script blocks without consent', async () => {
    await saveAgentBlockConfig(dataDir, SOURCE, 'test-agent', makeAgentConfig({
      customBlocks: [scriptBlock], blockOrder: [scriptBlock.id],
    }))
    const bundle = await (await call(`/stories/${SOURCE}/agent-config/export`)).json()

    const res = await post(`/stories/${TARGET}/agent-config/import`, { bundle })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.requiresConsent).toBe(true)

    const untouched = await getAgentBlockConfig(dataDir, TARGET, 'test-agent')
    expect(untouched.customBlocks).toHaveLength(0)
  })

  it('applies a script-carrying bundle with explicit consent', async () => {
    await saveAgentBlockConfig(dataDir, SOURCE, 'test-agent', makeAgentConfig({
      customBlocks: [scriptBlock], blockOrder: [scriptBlock.id],
    }))
    const bundle = await (await call(`/stories/${SOURCE}/agent-config/export`)).json()

    const res = await post(`/stories/${TARGET}/agent-config/import`, { bundle, consentToScripts: true })
    expect(res.status).toBe(200)

    const imported = await getAgentBlockConfig(dataDir, TARGET, 'test-agent')
    expect(imported.customBlocks[0].type).toBe('script')
  })

  it('accepts a legacy { agentBlockConfigs } export file', async () => {
    const res = await post(`/stories/${TARGET}/agent-config/import`, {
      bundle: { agentBlockConfigs: { 'test-agent': makeAgentConfig() } },
    })
    expect(res.status).toBe(200)

    const imported = await getAgentBlockConfig(dataDir, TARGET, 'test-agent')
    expect(imported.customBlocks).toHaveLength(1)
  })

  it('422s on a payload that is not an agent config bundle', async () => {
    const res = await post(`/stories/${TARGET}/agent-config/import`, { bundle: { foo: 'bar' } })
    expect(res.status).toBe(422)
  })

  it('404s importing into a missing story', async () => {
    const res = await post('/stories/nope/agent-config/import', {
      bundle: { agentBlockConfigs: { 'test-agent': makeAgentConfig() } },
    })
    expect(res.status).toBe(404)
  })
})

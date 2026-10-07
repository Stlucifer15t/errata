import { describe, expect, it } from 'vitest'
import {
  readStorySetupSession,
  writeStorySetupSession,
  type StorySetupSession,
} from '@/components/wizard/story-setup-session'

class MemoryStorage {
  protected values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

class QuotaLimitedStorage extends MemoryStorage {
  setItem(key: string, value: string) {
    if (value.length > 3000) throw new Error('QuotaExceededError')
    super.setItem(key, value)
  }
}

const session: StorySetupSession = {
  messages: [
    { role: 'assistant', content: 'What are you starting with?' },
    {
      role: 'user',
      content: 'A courier carrying a stolen memory.',
      images: [{ name: 'moodboard.png', mediaType: 'image/png', data: 'AQID' }],
    },
  ],
  checklist: [{ key: 'starting-point', status: 'covered', note: 'A rough premise' }],
  draftFragments: [{
    id: 'ch-mara',
    key: 'mara',
    type: 'character',
    name: 'Mara',
    description: 'Courier with a stolen memory',
    content: 'Mara is a cautious courier.',
  }],
}

describe('story setup session', () => {
  it('restores the setup conversation and working state for a story', () => {
    const storage = new MemoryStorage()

    writeStorySetupSession(storage, 'story-test', session)

    expect(readStorySetupSession(storage, 'story-test')).toEqual(session)
    expect(readStorySetupSession(storage, 'another-story')).toBeNull()
  })

  it('falls back to a text transcript if image data exceeds browser storage quota', () => {
    const storage = new QuotaLimitedStorage()
    const largeImageSession: StorySetupSession = {
      ...session,
      messages: [{
        role: 'user',
        content: 'Read this picture.',
        images: [{ name: 'reference.png', mediaType: 'image/png', data: 'A'.repeat(4000) }],
      }],
    }

    writeStorySetupSession(storage, 'story-test', largeImageSession)

    const restored = readStorySetupSession(storage, 'story-test')
    expect(restored?.messages[0].content).toContain('[Image reference.png was not retained in this browser session.]')
    expect(restored?.messages[0].images).toBeUndefined()
  })

  it('ignores malformed saved state', () => {
    const storage = new MemoryStorage()
    storage.setItem('errata:story-setup:story-test', '{"messages":"not-an-array"}')

    expect(readStorySetupSession(storage, 'story-test')).toBeNull()
  })
})

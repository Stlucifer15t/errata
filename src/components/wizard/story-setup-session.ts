import { z } from 'zod/v4'
import { ChatMessageSchema } from '@/lib/chat-message'
import type {
  StorySetupChecklistItem,
  StorySetupDraftFragment,
  StorySetupMessage,
} from '@/lib/api'

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const StorySetupSessionSchema = z.object({
  messages: z.array(ChatMessageSchema),
  checklist: z.array(z.object({
    key: z.enum(['starting-point', 'premise', 'characters', 'goal', 'setting', 'voice', 'opening']),
    status: z.enum(['missing', 'partial', 'covered']),
    note: z.string(),
  })),
  draftFragments: z.array(z.object({
    id: z.string().optional(),
    key: z.string(),
    type: z.enum(['guideline', 'knowledge', 'character', 'prose']),
    name: z.string(),
    description: z.string(),
    content: z.string(),
  })),
})

export interface StorySetupSession {
  messages: StorySetupMessage[]
  checklist: StorySetupChecklistItem[]
  draftFragments: StorySetupDraftFragment[]
}

function sessionKey(storyId: string) {
  return `errata:story-setup:${storyId}`
}

export function readStorySetupSession(storage: StorageLike, storyId: string): StorySetupSession | null {
  try {
    const raw = storage.getItem(sessionKey(storyId))
    if (!raw) return null
    const parsed = StorySetupSessionSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeStorySetupSession(storage: StorageLike, storyId: string, session: StorySetupSession): void {
  const key = sessionKey(storyId)
  try {
    storage.setItem(key, JSON.stringify(session))
  } catch {
    // Keep the text transcript if image data pushes localStorage over its quota.
    const textOnlySession: StorySetupSession = {
      ...session,
      messages: session.messages.map((message) => {
        if (!message.images?.length) return message
        const imageNote = message.images
          .map(image => `[Image ${image.name} was not retained in this browser session.]`)
          .join('\n')
        return {
          role: message.role,
          content: [message.content, imageNote].filter(Boolean).join('\n'),
        }
      }),
    }

    try {
      storage.setItem(key, JSON.stringify(textOnlySession))
    } catch {
      // Setup remains usable if browser storage is unavailable or full.
    }
  }
}

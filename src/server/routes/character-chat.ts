import { Elysia, t } from 'elysia'
import { getStory, getFragment } from '../fragments/storage'
import { createAgentInstance } from '../agents'
import {
  saveConversation as saveCharacterConversation,
  getConversation as getCharacterConversation,
  listConversations as listCharacterConversations,
  deleteConversation as deleteCharacterConversation,
  generateConversationId,
  type CharacterChatConversation,
} from '../character-chat/storage'
import { createLogger } from '../logging'
import { encodeStream } from './encode-stream'
import type { AgentStreamEvent } from '../agents/stream-types'
import { chatMessageBodySchema } from './chat-schema'

export function characterChatRoutes(dataDir: string) {
  const logger = createLogger('api:character-chat', { dataDir })

  return new Elysia({ detail: { tags: ['Character Chat'] } })
    .get('/stories/:storyId/character-chat/conversations', async ({ params, query }) => {
      const characterId = typeof query?.characterId === 'string' ? query.characterId : undefined
      return listCharacterConversations(dataDir, params.storyId, characterId)
    }, {
      detail: { summary: 'List conversations, optionally filtered by character' },
    })

    .get('/stories/:storyId/character-chat/conversations/:conversationId', async ({ params, set }) => {
      const conv = await getCharacterConversation(dataDir, params.storyId, params.conversationId)
      if (!conv) {
        set.status = 404
        return { error: 'Conversation not found' }
      }
      return conv
    }, {
      detail: { summary: 'Get a conversation by ID' },
    })

    .post('/stories/:storyId/character-chat/conversations', async ({ params, body, set }) => {
      const story = await getStory(dataDir, params.storyId)
      if (!story) {
        set.status = 404
        return { error: 'Story not found' }
      }

      const character = await getFragment(dataDir, params.storyId, body.characterId)
      if (!character || character.type !== 'character') {
        set.status = 404
        return { error: 'Character not found' }
      }

      const now = new Date().toISOString()
      const conv: CharacterChatConversation = {
        id: generateConversationId(),
        characterId: body.characterId,
        persona: body.persona,
        storyPointFragmentId: body.storyPointFragmentId ?? null,
        title: body.title || `Chat with ${character.name}`,
        messages: [],
        createdAt: now,
        updatedAt: now,
      }
      await saveCharacterConversation(dataDir, params.storyId, conv)
      return conv
    }, {
      detail: { summary: 'Create a new conversation' },
      body: t.Object({
        characterId: t.String(),
        persona: t.Union([
          t.Object({ type: t.Literal('character'), characterId: t.String() }),
          t.Object({ type: t.Literal('stranger') }),
          t.Object({ type: t.Literal('custom'), prompt: t.String() }),
        ]),
        storyPointFragmentId: t.Optional(t.Union([t.String(), t.Null()])),
        title: t.Optional(t.String()),
      }),
    })

    .delete('/stories/:storyId/character-chat/conversations/:conversationId', async ({ params, set }) => {
      const deleted = await deleteCharacterConversation(dataDir, params.storyId, params.conversationId)
      if (!deleted) {
        set.status = 404
        return { error: 'Conversation not found' }
      }
      return { ok: true }
    }, {
      detail: { summary: 'Delete a conversation' },
    })

    .post('/stories/:storyId/character-chat/conversations/:conversationId/chat', async ({ params, body, set }) => {
      const requestLogger = logger.child({ storyId: params.storyId, extra: { conversationId: params.conversationId } })
      requestLogger.info('Character chat request', { messageCount: body.messages.length })

      const story = await getStory(dataDir, params.storyId)
      if (!story) {
        set.status = 404
        return { error: 'Story not found' }
      }

      const conv = await getCharacterConversation(dataDir, params.storyId, params.conversationId)
      if (!conv) {
        set.status = 404
        return { error: 'Conversation not found' }
      }

      if (!body.messages.length) {
        set.status = 422
        return { error: 'At least one message is required' }
      }

      let agent: ReturnType<typeof createAgentInstance> | undefined
      /** Text streamed so far, updated as deltas flow through; used to persist
          a partial assistant reply when the stream fails or is aborted. */
      let streamedPartial = ''

      /** Save the sent messages plus the assistant reply (partial allowed). */
      const persistMessages = async (assistantText: string, assistantReasoning?: string) => {
        const now = new Date().toISOString()
        const updatedConv: CharacterChatConversation = {
          ...conv,
          messages: [
            ...body.messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              ...(m.images?.length ? { images: m.images } : {}),
              createdAt: now,
            })),

            {
              role: 'assistant' as const,
              content: assistantText,
              ...(assistantReasoning ? { reasoning: assistantReasoning } : {}),
              createdAt: now,
            },
          ],
          updatedAt: now,
        }
        await saveCharacterConversation(dataDir, params.storyId, updatedConv)
      }
      try {
        agent = createAgentInstance('character-chat.chat', { dataDir, storyId: params.storyId })
        const { eventStream, completion } = await agent.execute({
          characterId: conv.characterId,
          persona: conv.persona,
          storyPointFragmentId: conv.storyPointFragmentId,
          messages: body.messages,
          maxSteps: story.settings.maxSteps ?? 10,
        })

        // Mirror of the client-side accumulation: keep the last streamed text
        // so a failed/aborted exchange still persists what was generated.
        const trackedStream = new ReadableStream<AgentStreamEvent>({
          async start(controller) {
            const reader = eventStream.getReader()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                if (value.type === 'text') streamedPartial += (value.text ?? '')
                controller.enqueue(value)
              }
              controller.close()
            } catch (err) {
              controller.error(err)
            }
          },
          cancel() {
            eventStream.cancel()
          },
        })

        // Persist conversation after completion (in background)
        completion.then(async (result) => {
          requestLogger.info('Character chat completed', {
            stepCount: result.stepCount,
            finishReason: result.finishReason,
            toolCallCount: result.toolCalls.length,
          })
          await persistMessages(result.text, result.reasoning)
        }).catch(async (err) => {
          requestLogger.error('Character chat completion error', { error: err instanceof Error ? err.message : String(err) })
          // Keep whatever streamed before the failure instead of dropping the
          // whole exchange.
          const partial = streamedPartial.trim()
          if (partial) {
            await persistMessages(partial)
          }
        })

        return new Response(encodeStream(trackedStream), {
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        })
      } catch (err) {
        agent?.fail(err)
        requestLogger.error('Character chat failed', { error: err instanceof Error ? err.message : String(err) })
        set.status = 500
        return { error: err instanceof Error ? err.message : 'Chat failed' }
      }
    }, {
      detail: { summary: 'Send a message (streaming NDJSON)' },
      body: t.Object({
        messages: t.Array(chatMessageBodySchema),
      }),
    })
}

import { describe, expect, it } from 'vitest'
import {
  ChatMessagesSchema,
  chatMessagesToModelMessages,
  MAX_CHAT_IMAGE_BASE64_LENGTH,
} from '@/lib/chat-message'

const attachment = {
  name: 'reference.png',
  mediaType: 'image/png' as const,
  data: 'AQID',
}

describe('multimodal chat messages', () => {
  it('converts text and image attachments into AI SDK image parts', () => {
    expect(chatMessagesToModelMessages([{
      role: 'user',
      content: 'What is in this picture?',
      images: [attachment],
    }])).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this picture?' },
        { type: 'image', image: attachment.data, mediaType: 'image/png' },
      ],
    }])
  })

  it('supports image-only user messages', () => {
    expect(chatMessagesToModelMessages([{
      role: 'user',
      content: '',
      images: [attachment],
    }])).toEqual([{
      role: 'user',
      content: [{ type: 'image', image: attachment.data, mediaType: 'image/png' }],
    }])
  })

  it('keeps text-only messages compatible with existing conversations', () => {
    expect(chatMessagesToModelMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])
  })

  it('rejects unsupported media, invalid base64, and oversized images', () => {
    expect(() => ChatMessagesSchema.parse([{
      role: 'user',
      content: '',
      images: [{ ...attachment, mediaType: 'image/svg+xml', data: 'AQID' }],
    }])).toThrow()

    expect(() => ChatMessagesSchema.parse([{
      role: 'user',
      content: '',
      images: [{ ...attachment, data: 'not base64!' }],
    }])).toThrow()

    expect(() => ChatMessagesSchema.parse([{
      role: 'user',
      content: '',
      images: [{ ...attachment, data: 'A'.repeat(MAX_CHAT_IMAGE_BASE64_LENGTH + 4) }],
    }])).toThrow()
  })

  it('does not allow images on assistant messages', () => {
    expect(() => ChatMessagesSchema.parse([{
      role: 'assistant',
      content: 'Hello',
      images: [attachment],
    }])).toThrow(/Only user messages can include images/)
  })
})

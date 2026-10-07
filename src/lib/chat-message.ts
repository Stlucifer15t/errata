import { z } from 'zod/v4'
import type { ModelMessage } from 'ai'
import {
  CHAT_IMAGE_MEDIA_TYPES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_IMAGE_BASE64_LENGTH,
  MAX_CHAT_IMAGES_PER_MESSAGE,
  type ChatImageAttachment,
} from './chat-image'

export type { ChatImageAttachment, ChatImageMediaType } from './chat-image'
export { CHAT_IMAGE_MEDIA_TYPES, MAX_CHAT_IMAGE_BYTES, MAX_CHAT_IMAGE_BASE64_LENGTH, MAX_CHAT_IMAGES_PER_MESSAGE } from './chat-image'

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function decodedBase64Length(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

export const ChatImageAttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mediaType: z.enum(CHAT_IMAGE_MEDIA_TYPES),
  /** Base64-encoded file bytes, without a data URL prefix. */
  data: z.string()
    .min(4)
    .max(MAX_CHAT_IMAGE_BASE64_LENGTH)
    .regex(BASE64_PATTERN, 'Image data must be valid base64.'),
}).superRefine((image, context) => {
  const byteLength = decodedBase64Length(image.data)
  if (byteLength < 1) {
    context.addIssue({ code: 'custom', path: ['data'], message: 'Image data is empty.' })
  } else if (byteLength > MAX_CHAT_IMAGE_BYTES) {
    context.addIssue({ code: 'custom', path: ['data'], message: 'Image must be 4 MB or smaller.' })
  }
})

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  images: z.array(ChatImageAttachmentSchema).max(MAX_CHAT_IMAGES_PER_MESSAGE).optional(),
}).superRefine((message, context) => {
  if (message.role === 'assistant' && message.images?.length) {
    context.addIssue({ code: 'custom', path: ['images'], message: 'Only user messages can include images.' })
  }
})

export const ChatMessagesSchema = z.array(ChatMessageSchema)
export type ChatMessageInput = z.infer<typeof ChatMessageSchema>

/** Convert the app's serializable chat messages into the multimodal format expected by AI SDK providers. */
export function chatMessagesToModelMessages(messages: ChatMessageInput[]): ModelMessage[] {
  const validatedMessages = ChatMessagesSchema.parse(messages)

  return validatedMessages.map((message) => {
    if (message.role !== 'user' || !message.images?.length) {
      return { role: message.role, content: message.content }
    }

    return {
      role: 'user',
      content: [
        ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
        ...message.images.map((image: ChatImageAttachment) => ({
          type: 'image' as const,
          image: image.data,
          mediaType: image.mediaType,
        })),
      ],
    }
  })
}

export function hasChatMessageContent(message: Pick<ChatMessageInput, 'content' | 'images'>): boolean {
  return Boolean(message.content.trim() || message.images?.length)
}

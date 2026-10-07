import { t } from 'elysia'
import {
  CHAT_IMAGE_MEDIA_TYPES,
  MAX_CHAT_IMAGES_PER_MESSAGE,
  MAX_CHAT_IMAGE_BASE64_LENGTH,
} from '@/lib/chat-image'

export const chatMessageBodySchema = t.Object({
  role: t.Union([t.Literal('user'), t.Literal('assistant')]),
  content: t.String(),
  images: t.Optional(t.Array(t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    mediaType: t.Union(CHAT_IMAGE_MEDIA_TYPES.map(mediaType => t.Literal(mediaType))),
    data: t.String({ minLength: 4, maxLength: MAX_CHAT_IMAGE_BASE64_LENGTH }),
  }), { maxItems: MAX_CHAT_IMAGES_PER_MESSAGE })),
})

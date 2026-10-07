export const CHAT_IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type ChatImageMediaType = typeof CHAT_IMAGE_MEDIA_TYPES[number]

export const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_CHAT_IMAGE_BASE64_LENGTH = Math.ceil(MAX_CHAT_IMAGE_BYTES / 3) * 4
export const MAX_CHAT_IMAGES_PER_MESSAGE = 4

export interface ChatImageAttachment {
  name: string
  mediaType: ChatImageMediaType
  /** Base64-encoded file bytes, without a data URL prefix. */
  data: string
}

export function imageAttachmentDataUrl(image: ChatImageAttachment): string {
  return `data:${image.mediaType};base64,${image.data}`
}

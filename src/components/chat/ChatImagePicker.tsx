import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CHAT_IMAGE_MEDIA_TYPES,
  MAX_CHAT_IMAGES_PER_MESSAGE,
  MAX_CHAT_IMAGE_BYTES,
  imageAttachmentDataUrl,
  type ChatImageAttachment,
  type ChatImageMediaType,
} from '@/lib/chat-image'

interface ChatImagePickerProps {
  images: ChatImageAttachment[]
  onChange: (images: ChatImageAttachment[]) => void
  disabled?: boolean
}

function readImageFile(file: File): Promise<ChatImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name || 'image'}.`))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Could not read ${file.name || 'image'}.`))
        return
      }

      const comma = reader.result.indexOf(',')
      if (comma === -1) {
        reject(new Error(`Could not read ${file.name || 'image'}.`))
        return
      }

      resolve({
        name: (file.name || 'image').slice(0, 255),
        mediaType: file.type.toLowerCase() as ChatImageMediaType,
        data: reader.result.slice(comma + 1),
      })
    }
    reader.readAsDataURL(file)
  })
}

export function ChatImagePicker({ images, onChange, disabled = false }: ChatImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

    setError(null)
    const availableSlots = MAX_CHAT_IMAGES_PER_MESSAGE - images.length
    if (availableSlots <= 0) {
      setError(`Attach up to ${MAX_CHAT_IMAGES_PER_MESSAGE} images per message.`)
      return
    }

    const additions: ChatImageAttachment[] = []
    const errors: string[] = []

    for (const file of selectedFiles.slice(0, availableSlots)) {
      if (!(CHAT_IMAGE_MEDIA_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
        errors.push(`${file.name || 'File'} is not a supported image. Use PNG, JPEG, WebP, or GIF.`)
        continue
      }
      if (file.size === 0 || file.size > MAX_CHAT_IMAGE_BYTES) {
        errors.push(`${file.name || 'Image'} must be larger than 0 bytes and no more than 4 MB.`)
        continue
      }

      try {
        additions.push(await readImageFile(file))
      } catch (caught) {
        errors.push(caught instanceof Error ? caught.message : 'Could not read the selected image.')
      }
    }

    if (selectedFiles.length > availableSlots) {
      errors.push(`Attach up to ${MAX_CHAT_IMAGES_PER_MESSAGE} images per message.`)
    }
    if (additions.length > 0) onChange([...images, ...additions])
    if (errors.length > 0) setError(errors.join(' '))
  }

  const removeImage = (index: number) => {
    onChange(images.filter((_, imageIndex) => imageIndex !== index))
    setError(null)
  }

  return (
    <div className="space-y-2" data-component-id="chat-image-picker">
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Images attached to this message" data-component-id="chat-image-preview-list">
          {images.map((image, index) => (
            <li
              key={`${image.name}-${index}`}
              className="flex max-w-52 items-center gap-2 rounded-md border border-border/40 bg-muted/20 p-1.5"
            >
              <img
                src={imageAttachmentDataUrl(image)}
                alt=""
                className="size-10 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-foreground/75" title={image.name}>
                {image.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6"
                disabled={disabled}
                onClick={() => removeImage(index)}
                aria-label={`Remove ${image.name}`}
              >
                <X className="size-3" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex min-h-8 items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={CHAT_IMAGE_MEDIA_TYPES.join(',')}
          multiple
          disabled={disabled}
          onChange={handleSelection}
          className="sr-only"
          aria-label="Choose images to attach"
          data-component-id="chat-image-file-input"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8"
          disabled={disabled || images.length >= MAX_CHAT_IMAGES_PER_MESSAGE}
          onClick={() => inputRef.current?.click()}
          aria-label="Attach images"
          title="Attach images"
          data-component-id="chat-image-attach"
        >
          <ImagePlus className="size-4" aria-hidden="true" />
        </Button>
        <span className="text-[0.625rem] text-muted-foreground">
          Attach an image for a vision-capable model.
        </span>
        {error && <span className="text-[0.625rem] text-destructive" role="alert">{error}</span>}
      </div>
    </div>
  )
}

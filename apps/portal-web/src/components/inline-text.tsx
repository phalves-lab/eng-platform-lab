import { Fragment } from 'react'
import { capitalize } from '@/lib/labels'
import { cn } from '@/lib/utils'

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*)/g

interface InlineTextProps {
  readonly text: string
  readonly capitalized?: boolean
  readonly className?: string
}

/**
 * Renders the inline markdown found in handbook fields: code spans become `<code>` and bold
 * stays bold. The text starts with an uppercase letter unless `capitalized` is false.
 */
export function InlineText({ text, capitalized = true, className }: InlineTextProps) {
  const value = capitalized ? capitalize(text.trim()) : text.trim()
  return (
    <span className={className}>
      {value.split(TOKEN).map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return (
            <code
              key={index}
              className={cn(
                'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground',
                'break-words',
              )}
            >
              {part.slice(1, -1)}
            </code>
          )
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          )
        return <Fragment key={index}>{part}</Fragment>
      })}
    </span>
  )
}

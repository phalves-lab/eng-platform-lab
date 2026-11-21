'use client'

import { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface FilterOption {
  value: string
  label: string
}

interface FilterSelectProps {
  readonly label: string
  readonly value: string
  readonly options: FilterOption[]
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

export function FilterSelect({ label, value, options, disabled, onChange }: FilterSelectProps) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled ?? false}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

import type { Metadata } from 'next'
import { AskChat } from '@/components/ask/ask-chat'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Pergunte ao handbook' }

export default function AskPage() {
  return (
    <>
      <PageHeader
        title="Pergunte ao handbook"
        description="Pergunte sobre padrões, sistemas, siglas ou decisões. Toda resposta mostra de onde veio."
      />
      <AskChat />
    </>
  )
}

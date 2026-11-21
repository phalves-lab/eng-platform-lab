import { Injectable } from '@nestjs/common'
import type { AskResponse, SearchHit } from '@lab/contracts'
import { HandbookService } from '../handbook/handbook.service.js'

const STANDARD_ID = /\b[A-Z]{2,}(?:-[A-Z]{2,})?-\d{1,3}\b/g

/**
 * Answers questions from the handbook without a language model: it returns the most relevant
 * passages with their sources. The model-backed mode plugs in here later, behind the same
 * response contract.
 */
@Injectable()
export class AskService {
  constructor(private readonly handbook: HandbookService) {}

  ask(question: string): AskResponse {
    const known = new Set(this.handbook.standardIds())
    const ids = [...new Set(question.toUpperCase().match(STANDARD_ID) ?? [])].filter((id) =>
      known.has(id),
    )
    const fromIds: SearchHit[] = ids.map((id) => {
      const standard = this.handbook.standard(id)
      return {
        source: standard.source,
        snippet: standard.fields['Regra'] ?? standard.title,
        score: 100,
      }
    })
    const hits = [...fromIds, ...this.handbook.search(question, 5)].slice(0, 6)

    if (!hits.length) {
      return {
        mode: 'retrieval',
        answer:
          'Não encontrei nada no handbook sobre isso. Tente outras palavras, um ID de padrão (como ENG-GIT-02) ou o nome de um sistema.',
        sources: [],
      }
    }
    return {
      mode: 'retrieval',
      answer: `Encontrei ${hits.length} trecho(s) do handbook relacionados. O mais relevante vem de ${hits[0]?.source}.`,
      sources: hits,
    }
  }
}

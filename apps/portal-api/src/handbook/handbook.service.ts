import { Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common'
import type {
  Decision,
  GlossaryEntry,
  HandbookOverview,
  SearchHit,
  Standard,
  StandardFilter,
  StandardSummary,
  System,
  SystemSummary,
} from '@lab/contracts'
import {
  type Handbook,
  type SystemCard,
  filterStandards,
  filterSystems,
  findStandard,
  findSystem,
  loadHandbook,
  lookupTerm,
  search,
} from '@lab/handbook'
import { CONFIG, type PortalConfig } from '../config/config.js'

const toSystemSummary = (system: SystemCard): SystemSummary => ({
  slug: system.slug,
  name: system.name,
  layer: system.layer,
  status: system.fields['Status'] ?? '',
  summary: system.fields['O que é'] ?? '',
})

/** Loads the handbook once at boot and answers read-only queries over it. */
@Injectable()
export class HandbookService implements OnModuleInit {
  private handbook: Handbook | null = null

  constructor(@Inject(CONFIG) private readonly config: Pick<PortalConfig, 'handbookDir'>) {}

  async onModuleInit() {
    this.handbook = await loadHandbook(this.config.handbookDir)
  }

  isLoaded(): boolean {
    return this.handbook !== null
  }

  private get data(): Handbook {
    if (!this.handbook) throw new Error('Handbook not loaded')
    return this.handbook
  }

  overview(): HandbookOverview {
    const standards = { VIGENTE: 0, CONFLITO: 0, PROPOSTO: 0, LACUNA: 0, DESCONHECIDO: 0 }
    for (const standard of this.data.standards) standards[standard.status] += 1
    return {
      standards,
      systems: this.data.systems.length,
      glossary: this.data.glossary.length,
      decisions: this.data.decisions.length,
    }
  }

  rulesForAi(): string | null {
    return this.data.rulesForAi
  }

  standards(filter: StandardFilter): StandardSummary[] {
    return filterStandards(this.data, filter).map(({ id, area, title, status }) => ({
      id,
      area,
      title,
      status,
    }))
  }

  standard(id: string): Standard {
    const found = findStandard(this.data, id)
    if (!found) throw new NotFoundException(`Standard ${id} not found`)
    const { id: standardId, area, title, status, fields, text, source } = found
    return { id: standardId, area, title, status, fields, text, source }
  }

  systems(term?: string): SystemSummary[] {
    return filterSystems(this.data, term).map(toSystemSummary)
  }

  system(slug: string): System {
    const found = findSystem(this.data, slug)
    if (!found) throw new NotFoundException(`System ${slug} not found`)
    return { ...toSystemSummary(found), fields: found.fields, source: found.source }
  }

  glossary(term?: string): GlossaryEntry[] {
    return term ? lookupTerm(this.data, term) : this.data.glossary
  }

  decisions(priority?: number): Decision[] {
    return this.data.decisions.filter((decision) => !priority || decision.priority === priority)
  }

  search(query: string, limit = 8): SearchHit[] {
    return search(this.data, query, limit)
  }

  /** The loaded handbook, for the shared tools that run over it. */
  snapshot(): Handbook {
    return this.data
  }

  standardIds(): string[] {
    return this.data.standards.map((standard) => standard.id)
  }
}

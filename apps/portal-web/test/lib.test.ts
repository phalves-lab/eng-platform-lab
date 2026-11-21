import { describe, expect, it } from 'vitest'
import { activeItem, NAV_GROUPS } from '../src/components/navigation'
import {
  areaOf,
  capitalize,
  CLIENT_LABEL,
  formatDate,
  isMaturity,
  MATURITIES,
  MATURITY_LABEL,
  MATURITY_TONE,
  SCOPE_TONE,
  cleanSnippet,
  formatBusinessDays,
  formatDateTime,
  shortSource,
  splitSource,
  splitSystemName,
  STATUS_LABEL,
  STATUS_TONE,
  systemStatus,
} from '../src/lib/labels'
import { cn, groupBy } from '../src/lib/utils'

describe('labels', () => {
  it('maps every standard status to a label and a tone', () => {
    expect(Object.keys(STATUS_LABEL)).toEqual(Object.keys(STATUS_TONE))
    expect(STATUS_TONE.LACUNA).toBe('danger')
  })

  it('formats ids, days, dates and sources', () => {
    expect(areaOf('ENG-GIT-02')).toBe('ENG-GIT')
    expect(areaOf('IA-1')).toBe('IA')
    expect(formatBusinessDays(0.4)).toBe('0,4 dia útil')
    expect(formatBusinessDays(2)).toBe('2,0 dias úteis')
    expect(formatDateTime('2026-11-20T22:36:00.000Z')).toBe('20/11, 19:36')
    expect(shortSource('01-padroes.md › ENG-GIT › ENG-GIT-02 · Nome')).toBe(
      'ENG-GIT › ENG-GIT-02 · Nome',
    )
  })

  it('cleans markdown from snippets', () => {
    expect(cleanSnippet('- **Regra:** use `feat/` **sempre** | ok  ')).toBe(
      'Regra: use feat/ sempre ok',
    )
  })
})

describe('utils and navigation', () => {
  it('groups items keeping first-seen order and merges classes', () => {
    const groups = groupBy([{ a: 'x' }, { a: 'y' }, { a: 'x' }], (item) => item.a)
    expect([...groups.keys()]).toEqual(['x', 'y'])
    expect(groups.get('x')).toHaveLength(2)
    const hidden: string | false = false
    expect(cn('p-2', hidden, 'p-4')).toBe('p-4')
  })

  it('finds the active navigation entry for a path', () => {
    expect(activeItem('/')?.title).toBe('Minha página')
    expect(activeItem('/padroes/ENG-QA-01')?.title).toBe('Padrões')
    expect(activeItem('/entregas/review')?.title).toBe('Review')
    expect(activeItem('/releases')?.title).toBe('Releases')
    expect(activeItem('/entregas/dora?time=Campanhas')?.title).toBe('DORA')
    expect(activeItem('/projetos/metricas-de-fluxo')?.title).toBe('Projetos')
    expect(activeItem('/nada')).toBeUndefined()
    expect(NAV_GROUPS.flatMap((group) => group.items)).toHaveLength(17)
  })
})

describe('catalog labels and navigation', () => {
  it('maps maturity and MCP scope to the badge tones of the portal', () => {
    expect(MATURITIES.map((value) => [MATURITY_LABEL[value], MATURITY_TONE[value]])).toEqual([
      ['Aprovado', 'success'],
      ['Piloto', 'info'],
      ['Rascunho', 'secondary'],
    ])
    expect(SCOPE_TONE).toEqual({ read: 'success', write: 'warning' })
    expect(CLIENT_LABEL['claude-code']).toBe('Claude Code')
    expect(isMaturity('pilot')).toBe(true)
    expect(isMaturity('beta')).toBe(false)
    expect(isMaturity(undefined)).toBe(false)
    expect(formatDate('2026-11-05')).toBe('05/11/2026')
  })

  it('lists the catalog pages under their own group', () => {
    expect(
      NAV_GROUPS.find((group) => group.label === 'Catálogo')?.items.map((i) => i.href),
    ).toEqual(['/catalogo/plugins', '/catalogo/mcps'])
    expect(activeItem('/catalogo/plugins/lab-grill')?.title).toBe('Plugins e skills')
  })
})

describe('handbook text helpers', () => {
  it('splits the repository out of a system name only when it looks like one', () => {
    expect(splitSystemName('MMS API (martech-mms-api)')).toEqual({
      title: 'MMS API',
      repo: 'martech-mms-api',
    })
    expect(splitSystemName('Front de templates (martech-template-web, Template PRO)').repo).toBe(
      'martech-template-web',
    )
    expect(splitSystemName('Insider (CDP)')).toEqual({ title: 'Insider (CDP)', repo: null })
    expect(splitSystemName('Módulos do MMS (catálogo)').repo).toBeNull()
  })

  it('maps a free-text system status to a label, tone and detail', () => {
    expect(systemStatus('produção.')).toEqual({ label: 'Produção', tone: 'success', detail: null })
    expect(systemStatus('produção (fase 1).')).toMatchObject({
      label: 'Produção',
      detail: 'Fase 1',
    })
    expect(systemStatus('legado (proposta de troca)')?.tone).toBe('warning')
    expect(systemStatus('incerto.')?.label).toBe('Incerto')
    expect(systemStatus('em avaliação.')).toEqual({
      label: 'Em avaliação',
      tone: 'secondary',
      detail: null,
    })
    expect(systemStatus(null)).toBeNull()
  })

  it('separates the glossary source and capitalizes text', () => {
    expect(splitSource('métrica de conversão. (Fonte: MC, 123)')).toEqual({
      body: 'métrica de conversão.',
      source: 'MC, 123',
    })
    expect(splitSource('sem fonte')).toEqual({ body: 'sem fonte', source: null })
    expect(capitalize('régua de comunicação')).toBe('Régua de comunicação')
  })
})

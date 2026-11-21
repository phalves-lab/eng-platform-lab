import { describe, expect, it } from 'vitest'
import { activeItem, NAV_GROUPS } from '../src/components/navigation'
import {
  areaOf,
  cleanSnippet,
  formatBusinessDays,
  formatDateTime,
  shortSource,
  STATUS_LABEL,
  STATUS_TONE,
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
    expect(activeItem('/nada')).toBeUndefined()
    expect(NAV_GROUPS.flatMap((group) => group.items)).toHaveLength(7)
  })
})

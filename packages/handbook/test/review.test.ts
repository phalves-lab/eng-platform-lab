import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadHandbook } from '../src/handbook.js'
import { parseFrontmatter } from '../src/markdown.js'
import { addMonths, assessReview, type ReviewItem, reviewItems } from '../src/review.js'

const LAB = fileURLToPath(new URL('../../../handbook', import.meta.url))
const NOW = new Date('2026-11-21T12:00:00.000Z')

const item = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  kind: 'document',
  ref: 'a.md',
  title: 'A',
  file: 'a.md',
  owner: '@time',
  reviewedAt: '2026-06-01',
  ...overrides,
})

describe('frontmatter', () => {
  it('reads flat pairs, strips quotes and ignores lists, blanks and unterminated blocks', () => {
    expect(
      parseFrontmatter("---\ntitle: T\ndono: '@time/x'\ntags:\n  - a\nvazio:\n---\n# A\n"),
    ).toStrictEqual({ title: 'T', dono: '@time/x' })
    expect(parseFrontmatter('# Sem frontmatter')).toEqual({})
    expect(parseFrontmatter('---\ndono: x\n')).toEqual({})
  })
})

describe('validade da documentação', () => {
  it('soma meses no calendário e corta no último dia do mês', () => {
    expect(addMonths('2026-05-21', 6)).toBe('2026-11-21')
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15')
  })

  it('classifica em dia, perto de vencer, vencido e sem dono ou data', () => {
    const options = { now: NOW, maxAgeMonths: 6 }
    expect(assessReview(item({ reviewedAt: '2026-10-01' }), options)).toMatchObject({
      status: 'ok',
      dueAt: '2027-04-01',
      ageDays: 51,
    })
    expect(assessReview(item({ reviewedAt: '2026-06-10' }), options).status).toBe('expiring')
    expect(assessReview(item({ reviewedAt: '2026-05-21' }), options).status).toBe('expiring')
    expect(assessReview(item({ reviewedAt: '2026-05-20' }), options).status).toBe('stale')
    expect(assessReview(item({ reviewedAt: null }), options)).toMatchObject({
      status: 'missing',
      dueAt: null,
      ageDays: null,
    })
    expect(assessReview(item({ owner: null }), options).status).toBe('missing')
    expect(
      assessReview(item({ reviewedAt: '2026-06-10' }), { ...options, expiringDays: 5 }),
    ).toMatchObject({ status: 'ok' })
    expect(
      assessReview(item({ reviewedAt: '2026-06-10' }), { ...options, maxAgeMonths: 3 }),
    ).toMatchObject({ status: 'stale' })
  })

  it('lê dono e revisão de cada arquivo e dos padrões que têm os próprios campos', async () => {
    const items = reviewItems(await loadHandbook(LAB))
    expect(items.filter((entry) => entry.kind === 'document').map((entry) => entry.ref)).toEqual([
      '00-indice.md',
      '01-padroes.md',
      '02-sistemas.md',
      '03-glossario.md',
      '04-modelo-adr.md',
      '05-decisoes-pendentes.md',
    ])
    expect(items.find((entry) => entry.ref === '02-sistemas.md')).toMatchObject({
      title: 'Handbook do laboratório, sistemas',
      owner: '@phalves-lab/arquitetura',
      reviewedAt: '2026-03-15',
    })
    expect(items.find((entry) => entry.ref === '05-decisoes-pendentes.md')?.owner).toBeNull()
    expect(items.filter((entry) => entry.kind === 'standard').map((entry) => entry.ref)).toEqual([
      'ENG-SEC-01',
      'IA-01',
      'IA-02',
    ])
    expect(items.find((entry) => entry.ref === 'IA-02')).toMatchObject({
      file: '01-padroes.md',
      owner: '@phalves-lab/ia',
      reviewedAt: '2026-11-21',
    })
    const statuses = items.map((entry) => assessReview(entry, { now: NOW, maxAgeMonths: 6 }).status)
    expect(statuses).toContain('stale')
    expect(statuses).toContain('expiring')
    expect(statuses).toContain('missing')
  })

  it('usa o título do arquivo quando não há frontmatter e descarta data inválida', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hb-review-'))
    await writeFile(join(dir, 'a.md'), '# Título A\n')
    await writeFile(join(dir, 'b.md'), '---\nrevisado_em: 2026-02-30\ndono: `@x`\n---\n')
    await writeFile(
      join(dir, 'c.md'),
      '# C\n## Área\n### X-1 · Algo\n- **Revisado em:** 2026-01-10\n',
    )
    const items = reviewItems(await loadHandbook(dir))
    expect(items).toEqual([
      expect.objectContaining({ ref: 'a.md', title: 'Título A', owner: null, reviewedAt: null }),
      expect.objectContaining({ ref: 'b.md', title: 'b.md', owner: '@x', reviewedAt: null }),
      expect.objectContaining({ ref: 'c.md', title: 'C' }),
      expect.objectContaining({ ref: 'X-1', owner: null, reviewedAt: '2026-01-10' }),
    ])
  })
})

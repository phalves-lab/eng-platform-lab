import { describe, expect, it } from 'vitest'
import { normalize, parseFields, parseSections, sourceOf } from '../src/markdown.js'

describe('markdown', () => {
  it('quebra em seções com a trilha de títulos e ignora frontmatter e blocos de código', () => {
    const sections = parseSections(
      'a.md',
      '---\ntitle: x\n---\n# Raiz\ntexto\n## Área\n### ID-1 · Título\n- **Regra:** faça\n```\n# não é título\n```\n## Outra\n',
    )
    expect(sections.map((s) => [s.level, s.title, s.parents])).toEqual([
      [1, 'Raiz', []],
      [2, 'Área', ['Raiz']],
      [3, 'ID-1 · Título', ['Raiz', 'Área']],
      [2, 'Outra', ['Raiz']],
    ])
    expect(sections[2]?.body).toContain('# não é título')
    expect(sourceOf(sections[2] as never)).toBe('a.md › Área › ID-1 · Título')
  })

  it('lê campos em negrito e normaliza texto', () => {
    expect(parseFields('- **Regra:** use X\n- **Status:**   VIGENTE\ntexto solto')).toEqual({
      Regra: 'use X',
      Status: 'VIGENTE',
    })
    expect(normalize('  Régua   de  Comunicação ')).toBe('regua de comunicacao')
    expect(parseSections('b.md', 'sem título')).toEqual([])
  })
})

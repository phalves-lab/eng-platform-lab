import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findTool, handbookTools, loadHandbook, uniqueCitations } from '../src/index.js'

const LAB = fileURLToPath(new URL('../../../handbook', import.meta.url))

const run = (handbook: Awaited<ReturnType<typeof loadHandbook>>, name: string, args = {}) => {
  const tool = findTool(name)
  if (!tool) throw new Error(`tool ${name} missing`)
  return tool.execute(handbook, args)
}

describe('ferramentas do handbook', async () => {
  const handbook = await loadHandbook(LAB)

  it('expõe as oito ferramentas com schema de entrada', () => {
    expect(handbookTools.map((tool) => tool.name)).toEqual([
      'regras_para_ia',
      'padrao',
      'buscar_padroes',
      'sistema',
      'buscar_sistemas',
      'glossario',
      'decisoes_pendentes',
      'buscar',
    ])
    expect(findTool('nao_existe')).toBeNull()
  })

  it('cita padrão, sistema, termo e trecho', () => {
    expect(run(handbook, 'padrao', { id: 'eng-qa-01' }).citations).toEqual([
      expect.objectContaining({ kind: 'standard', ref: 'ENG-QA-01' }),
    ])
    const system = run(handbook, 'sistema', { nome: 'bot de review' })
    expect(system.citations[0]).toMatchObject({ kind: 'system', label: 'Bot de review' })
    expect(run(handbook, 'glossario', { termo: 'golden set' }).citations[0]).toMatchObject({
      kind: 'term',
      ref: 'Golden set',
    })
    expect(run(handbook, 'regras_para_ia').citations[0]?.kind).toBe('passage')
    const decisions = run(handbook, 'decisoes_pendentes').citations
    expect(decisions.map((c) => c.ref)).toEqual(['ENG-PR-03', 'IA-02'])
    expect(run(handbook, 'buscar_padroes', { status: 'LACUNA' }).citations).toHaveLength(1)
    expect(run(handbook, 'buscar_sistemas', { termo: 'postgres' }).citations).toHaveLength(1)
  })

  it('transforma trecho de padrão em citação do padrão e não repete citações', () => {
    const hits = run(handbook, 'buscar', { consulta: 'cobertura teste' }).citations
    expect(hits[0]).toMatchObject({ kind: 'standard', ref: 'ENG-QA-01' })
    expect(new Set(hits.map((c) => `${c.kind}:${c.ref}`)).size).toBe(hits.length)
    expect(
      uniqueCitations([
        { kind: 'term', ref: 'a', label: 'a', source: 's' },
        { kind: 'term', ref: 'a', label: 'a', source: 's' },
      ]),
    ).toHaveLength(1)
  })

  it('não cita nada quando não encontra e recusa argumento inválido', () => {
    expect(run(handbook, 'padrao', { id: 'ENG-ZZ-99' }).citations).toEqual([])
    expect(run(handbook, 'buscar', { consulta: 'xyzxyz' }).citations).toEqual([])
    expect(() => run(handbook, 'padrao', { id: 1 })).toThrow()
  })
})

describe('trecho e decisão fora de padrão', () => {
  it('viram citação de trecho com a seção como fonte', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hb-tools-'))
    await writeFile(
      join(dir, '01-a.md'),
      [
        '# Times',
        '## Plataforma',
        'Cuida do portal e do bot.',
        '## G',
        '**Golden set**: casos de teste do bot.',
        '## Prioridade 2: dados',
        '| ID | Tema | Situação | O que decidir |',
        '| --- | --- | --- | --- |',
        '| DADOS-09 | Retenção | Lacuna | por quanto tempo guardar? |',
      ].join('\n'),
    )
    const handbook = await loadHandbook(dir)
    expect(run(handbook, 'buscar', { consulta: 'portal' }).citations).toEqual([
      {
        kind: 'passage',
        ref: '01-a.md › Plataforma',
        label: 'Plataforma',
        source: '01-a.md › Plataforma',
      },
    ])
    expect(run(handbook, 'buscar', { consulta: 'golden' }).citations[0]?.label).toBe('a › G')
    expect(run(handbook, 'decisoes_pendentes').citations).toEqual([
      {
        kind: 'passage',
        ref: '01-a.md › Prioridade 2: dados',
        label: 'DADOS-09 · Retenção',
        source: '01-a.md › Prioridade 2: dados',
      },
    ])
  })
})

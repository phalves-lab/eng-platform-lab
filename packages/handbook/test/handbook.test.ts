import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  filterStandards,
  filterSystems,
  findStandard,
  findSystem,
  loadHandbook,
  lookupTerm,
  search,
} from '../src/handbook.js'

const LAB = fileURLToPath(new URL('../../../handbook', import.meta.url))

describe('handbook do laboratório', async () => {
  const handbook = await loadHandbook(LAB)

  it('indexa padrões, sistemas, glossário, decisões e regras para IA', () => {
    expect(handbook.files).toContain('01-padroes.md')
    expect(handbook.standards.map((s) => s.id)).toContain('ENG-GIT-02')
    expect(findStandard(handbook, ' eng-git-02 ')).toMatchObject({
      status: 'VIGENTE',
      area: 'ENG-GIT: branches e commits',
    })
    expect(findStandard(handbook, 'NAO-1')).toBeNull()
    expect(handbook.systems.map((s) => s.name)).toEqual([
      'API de solicitações de campanha',
      'Painel de review',
      'Bot de review',
      'Servidor de contexto',
      'Worker de notificações',
      'Worker do portal',
      'Portal de engenharia',
    ])
    expect(handbook.systems[2]?.layer).toBe('Ferramentas')
    expect(handbook.glossary.map((g) => g.term)).toContain('Golden set')
    expect(handbook.decisions).toEqual([
      expect.objectContaining({ id: 'ENG-PR-03', priority: 1, kind: 'Lacuna' }),
      expect.objectContaining({ id: 'IA-02', priority: 3 }),
    ])
    expect(handbook.rulesForAi).toContain('ENG-SEC-01')
  })

  it('filtra padrões por termo, área e status', () => {
    expect(filterStandards(handbook, { status: 'LACUNA' }).map((s) => s.id)).toEqual(['ENG-PR-03'])
    expect(filterStandards(handbook, { area: 'eng-sec' }).map((s) => s.id)).toEqual([
      'ENG-SEC-01',
      'ENG-SEC-02',
    ])
    expect(filterStandards(handbook, { area: 'segurança' })).toHaveLength(2)
    expect(filterStandards(handbook, { term: 'golden set' }).map((s) => s.id)).toEqual([
      'IA-01',
      'IA-02',
    ])
    expect(filterStandards(handbook, {})).toHaveLength(handbook.standards.length)
  })

  it('acha sistemas por nome exato, prefixo ou trecho, e filtra por termo', () => {
    expect(findSystem(handbook, 'painel de review')?.name).toBe('Painel de review')
    expect(findSystem(handbook, 'bot')?.name).toBe('Bot de review')
    expect(findSystem(handbook, 'contexto')?.name).toBe('Servidor de contexto')
    expect(findSystem(handbook, 'kafka')).toBeNull()
    expect(filterSystems(handbook, 'postgres').map((s) => s.name)).toEqual([
      'API de solicitações de campanha',
    ])
    expect(filterSystems(handbook)).toHaveLength(7)
  })

  it('acha termos exatos, por sinônimo e por trecho', () => {
    expect(lookupTerm(handbook, 'fila de merge').map((e) => e.term)).toEqual([
      'Merge queue, fila de merge',
    ])
    expect(lookupTerm(handbook, 'sinal').map((e) => e.term)).toEqual(['Sinal do bot'])
    expect(lookupTerm(handbook, 'inexistente')).toEqual([])
  })

  it('busca em todo o handbook com trecho e fonte, título pesando mais', () => {
    const hits = search(handbook, 'cobertura teste', 3)
    expect(hits[0]?.source).toContain('ENG-QA-01')
    expect(hits[0]?.snippet).toContain('70%')
    expect(search(handbook, 'de a')).toEqual([])
    expect(search(handbook, 'xyzxyz')).toEqual([])
  })
})

describe('handbook incompleto', () => {
  it('funciona sem seção Para IA e com status desconhecido', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hb-'))
    await writeFile(join(dir, 'a.md'), '# A\n## Área\n### X-1 · Algo\n- **Regra:** r\n')
    await writeFile(join(dir, 'ignorar.txt'), 'nada')
    const handbook = await loadHandbook(dir)
    expect(handbook.rulesForAi).toBeNull()
    expect(handbook.standards[0]?.status).toBe('DESCONHECIDO')
    expect(handbook.files).toEqual(['a.md'])
  })
})

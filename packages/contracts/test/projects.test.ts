import { describe, expect, it } from 'vitest'
import {
  CatalogModuleSchema,
  ProjectEntrySchema,
  ProjectIdParamSchema,
  ProjectListQuerySchema,
} from '../src/index.js'

const entry = {
  id: 'reprocessamento-de-filas',
  name: 'Reprocessamento de filas',
  objective: 'Reprocessar mensagens sem perder aviso.',
  status: 'active',
  owner: '@lab/mensageria',
}

describe('contratos de projeto', () => {
  it('aplica os padrões do cadastro e normaliza listas vazias', () => {
    expect(ProjectEntrySchema.parse(entry)).toEqual({
      ...entry,
      epic: null,
      repos: [],
      systems: [],
      decisions: [],
      risks: [],
    })
    expect(
      ProjectEntrySchema.parse({
        ...entry,
        epic: 'OPS-1',
        risks: [{ title: 'Fila sem dono', severity: 'high' }],
      }).risks,
    ).toEqual([{ title: 'Fila sem dono', severity: 'high', mitigation: null }])
  })

  it('recusa id fora de kebab-case, épico sem chave, repositório sem dono e campo desconhecido', () => {
    expect(ProjectEntrySchema.safeParse({ ...entry, id: 'Filas' }).success).toBe(false)
    expect(ProjectEntrySchema.safeParse({ ...entry, epic: 'ops-1' }).success).toBe(false)
    expect(ProjectEntrySchema.safeParse({ ...entry, repos: ['sem-dono'] }).success).toBe(false)
    expect(ProjectEntrySchema.safeParse({ ...entry, status: 'em andamento' }).success).toBe(false)
    expect(ProjectEntrySchema.safeParse({ ...entry, prazo: '2026-12-01' }).success).toBe(false)
    expect(
      ProjectEntrySchema.safeParse({ ...entry, risks: [{ title: 'x', severity: 'alta' }] }).success,
    ).toBe(false)
  })

  it('valida o id da rota, o filtro da listagem e o módulo do catálogo', () => {
    expect(ProjectIdParamSchema.safeParse('reprocessamento-de-filas').success).toBe(true)
    expect(ProjectIdParamSchema.safeParse('../etc').success).toBe(false)
    expect(ProjectListQuerySchema.parse({ term: ' filas ' })).toEqual({ term: 'filas' })
    expect(ProjectListQuerySchema.safeParse({ term: '' }).success).toBe(false)
    expect(
      CatalogModuleSchema.parse({
        name: 'portal',
        description: 'Portal',
        owner: '@lab/platform',
        tier: 'tier-2',
        users: 'Devs',
      }),
    ).toEqual({
      name: 'portal',
      description: 'Portal',
      owner: '@lab/platform',
      tier: 'tier-2',
      paths: [],
    })
  })
})

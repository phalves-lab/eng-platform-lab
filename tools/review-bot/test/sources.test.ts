import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { ConfluenceDocSource, JiraTaskSource } from '../src/sources/atlassian.js'
import { FixtureDocSource, FixtureTaskSource } from '../src/sources/fixtures.js'
import {
  adfToText,
  extractAcceptanceCriteria,
  extractTaskKey,
  storageToText,
} from '../src/sources/text.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))

describe('extractTaskKey', () => {
  it('acha a chave na branch antes do título', () => {
    expect(extractTaskKey('feat/LAB-12-aprovacao', 'feat: algo LAB-99')).toBe('LAB-12')
  })
  it('usa o título quando a branch não tem chave', () => {
    expect(extractTaskKey('feat/sem-chave', 'fix: ABC-3511 ajuste')).toBe('ABC-3511')
  })
  it('devolve null sem chave', () => {
    expect(extractTaskKey('main', undefined, null)).toBeNull()
  })
})

describe('extractAcceptanceCriteria', () => {
  it('lê itens abaixo do título em várias grafias', () => {
    const text =
      'Contexto\n\nCritérios de Aceitação:\n- primeiro\n2) segundo\n[x] terceiro\n\nOutra seção'
    expect(extractAcceptanceCriteria(text)).toEqual(['primeiro', 'segundo', 'terceiro'])
  })
  it('para no primeiro texto que não é item', () => {
    expect(extractAcceptanceCriteria('Acceptance criteria\n- a\nfim\n- b')).toEqual(['a'])
  })
  it('devolve vazio sem a seção', () => {
    expect(extractAcceptanceCriteria('sem nada')).toEqual([])
  })
})

describe('conversores de texto', () => {
  it('converte ADF com listas e quebras', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Critérios de aceite' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'um' }] }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    }
    const text = adfToText(adf)
    expect(text).toContain('- um')
    expect(extractAcceptanceCriteria(text)).toEqual(['um'])
    expect(adfToText(null)).toBe('')
    expect(adfToText('puro')).toBe('puro')
  })

  it('converte storage do Confluence', () => {
    expect(
      storageToText('<h1>T</h1><ul><li>a &amp; b</li></ul><p>x<br/>y&nbsp;&lt;z&gt;</p>'),
    ).toBe('T\n- a & b\nx\ny <z>')
  })
})

describe('fontes de fixtures', () => {
  it('lê task e página sintéticas', async () => {
    const task = await new FixtureTaskSource(`${root}fixtures/jira`).getTask('LAB-1')
    expect(task?.acceptanceCriteria.length).toBeGreaterThan(0)
    expect(await new FixtureTaskSource(`${root}fixtures/jira`).getTask('LAB-404')).toBeNull()
    const page = await new FixtureDocSource(`${root}fixtures/confluence`).getPage(
      'lab-campaign-requests',
    )
    expect(page?.title).toBeTruthy()
  })
})

describe('fontes Atlassian (somente leitura)', () => {
  const options = { site: 'exemplo.atlassian.net', email: 'a@b.c', apiToken: 't' }

  it('monta a task a partir da issue do Jira', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            key: 'ABC-1',
            fields: {
              summary: 'Título',
              description: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Critérios de aceite' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: '- deve fazer X' }] },
                ],
              },
              status: { name: 'Em andamento' },
              labels: ['mms'],
              parent: { key: 'ABC-0', fields: { summary: 'Épico' } },
            },
          }),
          { status: 200 },
        ),
    )
    const task = await new JiraTaskSource({ ...options, fetchImpl }).getTask('ABC-1')
    expect(task).toMatchObject({
      key: 'ABC-1',
      acceptanceCriteria: ['deve fazer X'],
      epic: 'ABC-0 Épico',
      url: 'https://exemplo.atlassian.net/browse/ABC-1',
    })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('GET')
    expect(url).toContain('/rest/api/3/issue/ABC-1?fields=')
  })

  it('prefere o campo customizado de critério de aceite quando configurado', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            key: 'ABC-2',
            fields: { summary: 'T', description: null, customfield_1: '- do campo' },
          }),
          { status: 200 },
        ),
    )
    const task = await new JiraTaskSource({
      ...options,
      acceptanceField: 'customfield_1',
      fetchImpl,
    }).getTask('ABC-2')
    expect(task).toMatchObject({
      acceptanceCriteria: ['do campo'],
      status: 'desconhecido',
      epic: null,
    })
  })

  it('lê página do Confluence', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: '9',
            title: 'Módulo',
            version: { createdAt: '2026-11-01' },
            body: { storage: { value: '<p>texto</p>' } },
            _links: { webui: '/spaces/X/pages/9' },
          }),
          { status: 200 },
        ),
    )
    expect(await new ConfluenceDocSource({ ...options, fetchImpl }).getPage('9')).toEqual({
      id: '9',
      title: 'Módulo',
      text: 'texto',
      updatedAt: '2026-11-01',
      url: 'https://exemplo.atlassian.net/wiki/spaces/X/pages/9',
    })
  })

  it('devolve null quando não existe', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    expect(await new JiraTaskSource({ ...options, fetchImpl }).getTask('X-1')).toBeNull()
    expect(await new ConfluenceDocSource({ ...options, fetchImpl }).getPage('1')).toBeNull()
  })
})

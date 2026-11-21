import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CatalogError, filterPlugins, findPlugin, loadAiCatalog } from '../src/index.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const LAB = {
  marketplaceDir: join(ROOT, 'fixtures/marketplace'),
  overlayDir: join(ROOT, 'catalog/ai'),
}

const write = async (root: string, files: Record<string, string | object>) => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
  }
}

const OVERLAY: Record<string, string> = {
  'plugins.yaml': 'marketplace:\n  source: org/plugins\nplugins: []\n',
  'mcps.yaml': 'mcps: []\n',
}

const scratch = async (
  marketplace: Record<string, string | object>,
  overlay: Record<string, string> = OVERLAY,
) => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-'))
  await write(join(root, 'market'), marketplace)
  await write(join(root, 'overlay'), overlay)
  return { marketplaceDir: join(root, 'market'), overlayDir: join(root, 'overlay') }
}

const manifest = (plugins: object[]) => ({
  '.claude-plugin/marketplace.json': { name: 'org-market', plugins },
})

const skill = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`

describe('catálogo do laboratório', async () => {
  const catalog = await loadAiCatalog(LAB)

  it('junta marketplace e overlay, com aprovados primeiro', () => {
    expect(catalog.marketplace).toEqual({
      name: 'lab-marketplace',
      source: './fixtures/marketplace',
    })
    expect(catalog.warnings).toEqual([])
    expect(catalog.plugins.map((plugin) => [plugin.name, plugin.maturity])).toEqual([
      ['lab-pr-review', 'approved'],
      ['lab-taskforge', 'approved'],
      ['lab-grill', 'pilot'],
      ['lab-onboarding', 'pilot'],
      ['lab-changelog', 'draft'],
    ])
    expect(findPlugin(catalog, 'lab-taskforge')).toMatchObject({
      displayName: 'Taskforge',
      version: '1.4.0',
      author: 'Plataforma do laboratório',
      owner: '@phalves-lab/platform',
      reviewedAt: '2026-11-10',
      skills: [
        { name: 'branch-name', description: expect.stringContaining('nome da branch') },
        { name: 'taskforge', description: expect.stringContaining('ponta a ponta') },
      ],
      install: {
        marketplace: 'lab-marketplace',
        commands: [
          '/plugin marketplace add ./fixtures/marketplace',
          '/plugin install lab-taskforge@lab-marketplace',
        ],
      },
    })
  })

  it('mostra plugin sem overlay como draft e sem dono', () => {
    expect(findPlugin(catalog, ' LAB-CHANGELOG ')).toMatchObject({
      maturity: 'draft',
      owner: null,
      reviewedAt: null,
    })
    expect(findPlugin(catalog, 'nope')).toBeNull()
  })

  it('filtra por maturidade e por termo sem acento, incluindo as skills', () => {
    expect(filterPlugins(catalog, { maturity: 'pilot' }).map((plugin) => plugin.name)).toEqual([
      'lab-grill',
      'lab-onboarding',
    ])
    expect(filterPlugins(catalog, { term: 'diagnostico' }).map((plugin) => plugin.name)).toEqual([
      'lab-onboarding',
    ])
    expect(filterPlugins(catalog, { term: 'review', maturity: 'draft' })).toEqual([])
    expect(filterPlugins(catalog, {})).toHaveLength(5)
  })

  it('lista os MCPs homologados com a instalação na ordem dos clientes', () => {
    expect(catalog.mcps.map((mcp) => [mcp.name, mcp.scope])).toEqual([
      ['martech-context', 'read'],
      ['github', 'read'],
      ['atlassian', 'write'],
      ['playwright', 'write'],
    ])
    const context = catalog.mcps[0]
    expect(context?.install.map((entry) => entry.client)).toEqual(['claude-code', 'kiro', 'cursor'])
    expect(context?.install[0]).toMatchObject({ language: 'bash', file: null })
    expect(context?.install[1]?.file).toBe('.kiro/settings/mcp.json')
    for (const mcp of catalog.mcps) {
      for (const entry of mcp.install.filter((item) => item.language === 'json')) {
        expect(() => JSON.parse(entry.snippet), `${mcp.name} ${entry.client}`).not.toThrow()
      }
    }
  })
})

describe('leitura de um marketplace qualquer', () => {
  it('aceita plugin remoto, plugin sem plugin.json e autor em texto', async () => {
    const dirs = await scratch(
      {
        ...manifest([
          { name: 'remote', source: { source: 'github', repo: 'org/remote' }, description: 'R' },
          { name: 'bare', source: './bare', description: 'Sem manifesto', author: 'Time' },
        ]),
        'bare/skills/one/SKILL.md': skill('one', 'Primeira'),
        'bare/skills/empty/README.md': 'sem skill',
      },
      {
        ...OVERLAY,
        'plugins.yaml':
          "marketplace:\n  source: org/plugins\nplugins:\n  - name: ghost\n    maturity: pilot\n    owner: '@x'\n    reviewedAt: '2026-01-01'\n",
      },
    )
    const catalog = await loadAiCatalog(dirs)
    expect(findPlugin(catalog, 'remote')).toMatchObject({ skills: [], displayName: 'remote' })
    expect(findPlugin(catalog, 'bare')).toMatchObject({
      author: 'Time',
      description: 'Sem manifesto',
      skills: [{ name: 'one', description: 'Primeira' }],
    })
    expect(catalog.warnings).toEqual(['plugins.yaml cita ghost, que não existe no marketplace'])
  })

  it('usa o pluginRoot do marketplace para resolver o source', async () => {
    const dirs = await scratch({
      '.claude-plugin/marketplace.json': {
        name: 'org-market',
        metadata: { pluginRoot: './plugins' },
        plugins: [{ name: 'a', source: 'a' }],
      },
      'plugins/a/.claude-plugin/plugin.json': { name: 'a', displayName: 'Plugin A' },
    })
    expect((await loadAiCatalog(dirs)).plugins[0]?.displayName).toBe('Plugin A')
  })

  it.each([
    ['marketplace ausente', {}, 'marketplace.json não encontrado'],
    [
      'JSON quebrado',
      { '.claude-plugin/marketplace.json': '{ nope' },
      'marketplace.json não é JSON válido',
    ],
    [
      'marketplace sem nome',
      { '.claude-plugin/marketplace.json': { plugins: [] } },
      'marketplace.json inválido: name',
    ],
    [
      'source fora da pasta',
      manifest([{ name: 'evil', source: '../../etc' }]),
      'source fora do marketplace',
    ],
    [
      'plugin.json sem nome',
      { ...manifest([{ name: 'a', source: './a' }]), 'a/.claude-plugin/plugin.json': {} },
      'plugin.json inválido: name',
    ],
    [
      'SKILL.md sem frontmatter',
      { ...manifest([{ name: 'a', source: './a' }]), 'a/skills/s/SKILL.md': '# s' },
      'SKILL.md sem frontmatter',
    ],
    [
      'SKILL.md sem descrição',
      {
        ...manifest([{ name: 'a', source: './a' }]),
        'a/skills/s/SKILL.md': '---\nname: s\n---\n',
      },
      'SKILL.md inválido: description',
    ],
  ])('recusa %s', async (_case, files, message) => {
    const dirs = await scratch(files)
    await expect(loadAiCatalog(dirs)).rejects.toThrow(message)
    await expect(loadAiCatalog(dirs)).rejects.toBeInstanceOf(CatalogError)
  })
})

describe('validação do overlay', () => {
  const plugin = (fields: string) =>
    `marketplace:\n  source: org/plugins\nplugins:\n  - name: a\n${fields}`

  it.each([
    [
      'maturidade desconhecida',
      {
        'plugins.yaml': plugin(
          "    maturity: beta\n    owner: '@x'\n    reviewedAt: '2026-01-01'\n",
        ),
      },
      'plugins.yaml inválido: plugins.0.maturity',
    ],
    [
      'data de revisão inválida',
      { 'plugins.yaml': plugin("    maturity: pilot\n    owner: '@x'\n    reviewedAt: ontem\n") },
      'plugins.0.reviewedAt',
    ],
    [
      'plugin repetido',
      {
        'plugins.yaml':
          "marketplace:\n  source: s\nplugins:\n  - { name: a, maturity: pilot, owner: x, reviewedAt: '2026-01-01' }\n  - { name: a, maturity: draft, owner: x, reviewedAt: '2026-01-01' }\n",
      },
      'a repetido',
    ],
    [
      'MCP sem instalação',
      {
        'mcps.yaml':
          "mcps:\n  - name: m\n    description: d\n    scope: read\n    accesses: [x]\n    owner: o\n    reviewedAt: '2026-01-01'\n    install: {}\n",
      },
      'informe ao menos um cliente',
    ],
    [
      'MCP com escopo desconhecido',
      {
        'mcps.yaml':
          "mcps:\n  - name: m\n    description: d\n    scope: admin\n    accesses: [x]\n    owner: o\n    reviewedAt: '2026-01-01'\n    install: { kiro: { language: json, snippet: '{}' } }\n",
      },
      'mcps.0.scope',
    ],
    ['YAML quebrado', { 'mcps.yaml': 'mcps: [\n' }, 'mcps.yaml não é YAML válido'],
  ])('recusa %s', async (_case, overlay, message) => {
    const dirs = await scratch(manifest([]), { ...OVERLAY, ...overlay })
    await expect(loadAiCatalog(dirs)).rejects.toThrow(message)
  })

  it('exige os dois arquivos do overlay', async () => {
    const dirs = await scratch(manifest([]), { 'plugins.yaml': OVERLAY['plugins.yaml'] ?? '' })
    await expect(loadAiCatalog(dirs)).rejects.toThrow('mcps.yaml não encontrado')
  })
})

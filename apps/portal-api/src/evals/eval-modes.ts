import { fileURLToPath } from 'node:url'
import type { DatasetId } from '@lab/contracts'
import { findPlugin, loadAiCatalog } from '@lab/catalog'
import { loadDoraCatalog } from '@lab/dora'
import { collectPanelData } from '@lab/eng-metrics/collect'
import type { PanelData } from '@lab/eng-metrics/contract'
import { DraftModes } from '../ask/modes/draft-modes.js'
import { loadModePrompts } from '../ask/modes/mode-prompts.js'
import { skillLookup } from '../ask/modes/skill-lookup.js'
import { handbookChatTools } from '../ask/tools/chat-tool.js'
import { createPortalTools } from '../ask/tools/portal-tools.js'
import { TaskFixtures } from '../ask/tools/task-fixtures.js'
import { FixtureDoraSource } from '../dora/dora-source.js'
import { DoraService } from '../dora/dora.service.js'
import type { HandbookService } from '../handbook/handbook.service.js'

const fromRepo = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

const NO_JIRA = 'o espelho do Jira só existe no banco; rode o coletor do Jira'

const loadSkills = async () => {
  try {
    const catalog = await loadAiCatalog({
      marketplaceDir: fromRepo('fixtures/marketplace'),
      overlayDir: fromRepo('catalog/ai'),
    })
    return skillLookup((plugin) => findPlugin(catalog, plugin)?.skills ?? null)
  } catch {
    return skillLookup(() => null)
  }
}

const reviewReader = (now: Date) => {
  let data: Promise<PanelData> | null = null
  return async (id: DatasetId) => {
    data ??= collectPanelData({ lab: null, demo: true }, now.toISOString())
    const found = (await data).datasets.find((dataset) => dataset.id === id)
    if (!found) throw new Error(`o conjunto ${id} não existe nas avaliações; use demo`)
    const { title, generatedAt, metrics, trend, alerts } = found
    return { title, generatedAt, metrics, trend, alerts }
  }
}

/**
 * Draft modes for the golden set, with the same prompts, skills and tools as the API but fed by
 * the synthetic sources: the demo review dataset, the DORA fixtures and the sample tasks. Flow
 * metrics need the Jira mirror in Postgres, so that tool answers that the data is unavailable.
 */
export const createEvalModes = async (handbook: HandbookService, now = new Date()) => {
  const dora = new DoraService(
    await loadDoraCatalog(fromRepo('catalog/dora/repos.yaml')),
    new FixtureDoraSource(fromRepo('fixtures/dora'), fromRepo('catalog/incidents')),
  )
  const tasks = new TaskFixtures(fromRepo('fixtures/jira'))
  return new DraftModes({
    prompts: await loadModePrompts(),
    handbookTools: handbookChatTools(() => handbook.snapshot()),
    portalTools: createPortalTools({
      review: reviewReader(now),
      flow: () => Promise.reject(new Error(NO_JIRA)),
      dora: (query) => dora.metrics(query, now),
      task: (key) => tasks.find(key),
    }),
    skill: await loadSkills(),
  })
}

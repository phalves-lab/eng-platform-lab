import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import { whenAvailable } from '@/lib/catalog'
import { PROJECT_STATUS } from '@/lib/projects'

const LIMIT = 6

export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (term.length < 2)
    return NextResponse.json({ standards: [], systems: [], terms: [], plugins: [], projects: [] })
  const [standards, systems, terms, plugins, projects] = await Promise.all([
    api.standards({ term }),
    api.systems(term),
    api.glossary(term),
    whenAvailable(api.plugins({ term })),
    api.projects(term).catch(() => []),
  ])
  return NextResponse.json({
    standards: standards.slice(0, LIMIT),
    systems: systems.slice(0, LIMIT),
    terms: terms.slice(0, LIMIT).map(({ term: name, definition }) => ({ term: name, definition })),
    plugins: (plugins ?? [])
      .slice(0, LIMIT)
      .map(({ name, displayName, maturity }) => ({ name, displayName, maturity })),
    projects: projects.slice(0, LIMIT).map(({ id, name, status }) => ({
      id,
      name,
      status: PROJECT_STATUS[status].label,
    })),
  })
}

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Person, PeopleFileSchema, type TeamRef } from '@lab/contracts'
import { sameAccount } from '@lab/flow'
import { parse } from 'yaml'

export const PEOPLE = Symbol('PEOPLE')

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

const sameLogin = (a: string, b: string) =>
  a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')

/** People and teams of `catalog/people/`, linking the portal login to Jira and GitHub. */
export class PeopleDirectory {
  constructor(
    readonly teams: TeamRef[],
    readonly people: Person[],
  ) {}

  byLogin(login: string): Person | null {
    return this.people.find((person) => sameLogin(person.login, login)) ?? null
  }

  team(id: string): TeamRef | null {
    return this.teams.find((team) => team.id === id) ?? null
  }

  /** Members in alphabetical order, so no view ever suggests a ranking. */
  members(teamId: string): Person[] {
    return this.people
      .filter((person) => person.team.id === teamId)
      .toSorted((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  /** Display name for a Jira assignee or GitHub login, or the raw account when unknown. */
  nameOf(account: string | null, side: 'jira' | 'github'): string | null {
    if (account === null) return null
    return this.people.find((person) => sameAccount(person[side], account))?.name ?? account
  }
}

const ensureUnique = (people: Person[], file: string) => {
  for (const side of ['login', 'jira', 'github'] as const) {
    const seen = new Set<string>()
    for (const person of people) {
      const value = person[side]?.toLocaleLowerCase('pt-BR')
      if (!value) continue
      if (seen.has(value)) {
        throw new Error(`Catálogo de pessoas repete ${side} ${person[side]} em ${file}`)
      }
      seen.add(value)
    }
  }
}

/**
 * Reads one YAML file per team. A missing directory means nobody is linked yet; an invalid file,
 * a repeated team or a login, Jira account or GitHub login used twice fails the boot.
 */
export const loadPeopleDirectory = (directory: string): PeopleDirectory => {
  let files: string[]
  try {
    files = readdirSync(directory)
      .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
      .sort()
  } catch (error) {
    if (isMissing(error)) return new PeopleDirectory([], [])
    throw error
  }
  const teams: TeamRef[] = []
  const people: Person[] = []
  for (const file of files) {
    const parsed = PeopleFileSchema.safeParse(parse(readFileSync(join(directory, file), 'utf8')))
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
        .join('; ')
      throw new Error(`Catálogo de pessoas inválido em ${file}: ${issues}`)
    }
    const { team: id, name, people: members } = parsed.data
    if (teams.some((team) => team.id === id)) {
      throw new Error(`Catálogo de pessoas repete o time ${id} em ${file}`)
    }
    const team = { id, name }
    teams.push(team)
    people.push(...members.map((member) => ({ ...member, team })))
    ensureUnique(people, file)
  }
  return new PeopleDirectory(
    teams.toSorted((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    people,
  )
}

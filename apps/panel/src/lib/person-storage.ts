const STORAGE_KEY = 'painel-review:pessoa'

export const readStoredPerson = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export const storePerson = (person: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, person)
  } catch {
    return
  }
}

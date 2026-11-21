import { inflateRawSync } from 'node:zlib'

export class ZipReadError extends Error {
  override readonly name = 'ZipReadError'
}

const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const STORED = 0
const DEFLATED = 8
const MAX_COMMENT = 0xffff
const DEFAULT_MAX_ENTRY_BYTES = 5 * 1024 * 1024

export interface ZipEntry {
  name: string
  content: Buffer
}

const findEndOfDirectory = (zip: Buffer) => {
  const last = Math.max(0, zip.length - 22 - MAX_COMMENT)
  for (let offset = zip.length - 22; offset >= last; offset -= 1) {
    if (zip.readUInt32LE(offset) === END_OF_DIRECTORY) return offset
  }
  throw new ZipReadError('arquivo zip sem diretório central')
}

/**
 * Reads the files of a GitHub Actions artifact archive (stored or deflated entries, no zip64).
 * Each entry is capped in size, so a malformed archive cannot exhaust memory.
 */
export const readZip = (zip: Buffer, maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES): ZipEntry[] => {
  if (zip.length < 22) throw new ZipReadError('arquivo zip vazio')
  const end = findEndOfDirectory(zip)
  const count = zip.readUInt16LE(end + 10)
  let cursor = zip.readUInt32LE(end + 16)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(cursor) !== DIRECTORY_ENTRY) {
      throw new ZipReadError('entrada inválida no diretório central')
    }
    const method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const size = zip.readUInt32LE(cursor + 24)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    cursor += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (size > maxEntryBytes) throw new ZipReadError(`${name} passa do limite de tamanho`)
    if (zip.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new ZipReadError(`cabeçalho local inválido em ${name}`)
    }
    const start =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    const data = zip.subarray(start, start + compressedSize)
    if (method === STORED) entries.push({ name, content: Buffer.from(data) })
    else if (method === DEFLATED) {
      entries.push({ name, content: inflateRawSync(data, { maxOutputLength: maxEntryBytes }) })
    } else throw new ZipReadError(`${name} usa compressão não suportada (${method})`)
  }
  return entries
}

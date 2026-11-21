import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ChatStreamEventSchema, createSseParser } from '@lab/contracts'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { MODEL_PROVIDER } from '../src/ask/model/model-provider.js'
import { loadConfig } from '../src/config/config.js'
import { FakeProvider, call } from './fake-provider.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('histórico de conversas no Postgres', () => {
  let db: IsolatedSchema
  const fake = new FakeProvider()
  const apps: INestApplication[] = []

  const start = async (login: string) => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORTAL_HANDBOOK_DIR: HANDBOOK,
      DATABASE_URL: db.connectionString,
      PORTAL_DEV_USER: login,
      PORTAL_LLM_BASE_URL: 'https://llm.example.invalid/v1',
      PORTAL_LLM_API_KEY: 'test-key',
      PORTAL_LLM_MODEL: 'modelo-sintetico',
    })
    const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(MODEL_PROVIDER)
      .useValue(fake)
      .compile()
    const app = module.createNestApplication()
    await app.init()
    apps.push(app)
    return app.getHttpServer()
  }

  const ask = async (server: unknown, body: object) => {
    const res = await request(server as never)
      .post('/api/ask/stream')
      .send(body)
      .buffer(true)
      .expect(200)
    return createSseParser()(res.text).map((data) => ChatStreamEventSchema.parse(JSON.parse(data)))
  }

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    for (const app of apps) await app.close()
    await db.drop()
  })

  it('guarda a conversa mascarada, continua com contexto e isola cada pessoa', async () => {
    const ana = await start('ana.lab')
    fake.play(
      { toolCalls: [call('padrao', { id: 'ENG-GIT-02' })] },
      { text: ['Pelo ENG-GIT-02, use <tipo>/LAB-<n>-slug.'] },
    )
    const first = await ask(ana, {
      question: 'Sou ana@exemplo.com, cartão 4111 1111 1111 1111. Qual o padrão de branch?',
    })
    const saved = first.at(-1)
    if (saved?.type !== 'conversation') throw new Error('conversation event missing')
    const id = saved.conversation.id
    expect(saved.conversation).toMatchObject({
      title: 'Sou [e-mail], cartão [cartão]. Qual o padrão de branch?',
      messageCount: 2,
    })

    const rows = await db.pool.query<{ author: string; content: string; tools: string[] }>(
      'SELECT author, content, tools FROM chat_messages WHERE conversation_id = $1 ORDER BY id',
      [id],
    )
    expect(rows.rows).toEqual([
      {
        author: 'user',
        content: 'Sou [e-mail], cartão [cartão]. Qual o padrão de branch?',
        tools: [],
      },
      {
        author: 'assistant',
        content: 'Pelo ENG-GIT-02, use <tipo>/LAB-<n>-slug.',
        tools: ['padrao'],
      },
    ])

    fake.play({ text: ['E o commit segue o ENG-GIT-03.'] })
    const second = await ask(ana, { question: 'E o de commit?', conversationId: id })
    expect(second.at(-1)).toMatchObject({ conversation: { id, messageCount: 4 } })
    expect(fake.requests[0]?.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])

    const list = await request(ana).get('/api/conversations').expect(200)
    expect(list.body).toEqual([expect.objectContaining({ id, messageCount: 4 })])
    const opened = await request(ana).get(`/api/conversations/${id}`).expect(200)
    expect(opened.body.messages[1]).toMatchObject({
      author: 'assistant',
      tools: ['padrao'],
      response: {
        mode: 'llm',
        answer: 'Pelo ENG-GIT-02, use <tipo>/LAB-<n>-slug.',
        citations: [expect.objectContaining({ ref: 'ENG-GIT-02' })],
      },
    })

    const bruno = await start('bruno.lab')
    expect((await request(bruno).get('/api/conversations').expect(200)).body).toEqual([])
    await request(bruno).get(`/api/conversations/${id}`).expect(404)
    await request(bruno).delete(`/api/conversations/${id}`).expect(404)
    await request(bruno)
      .post('/api/ask/stream')
      .send({ question: 'Continua?', conversationId: id })
      .expect(404)

    await request(ana).delete(`/api/conversations/${id}`).expect(204)
    await request(ana).get(`/api/conversations/${id}`).expect(404)
    const left = await db.pool.query('SELECT 1 FROM chat_messages WHERE conversation_id = $1', [id])
    expect(left.rowCount).toBe(0)
  })
})

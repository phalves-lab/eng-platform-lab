import { describe, expect, it } from 'vitest'
import { InMemoryCampaignRequestRepository } from '../../src/domain/repository.js'
import { buildApp } from '../../src/http/app.js'

const ID = '7b0f6a1e-4a52-4f1e-9a3b-2a6f7e3c9d10'

const setup = () =>
  buildApp({
    repository: new InMemoryCampaignRequestRepository(),
    clock: () => new Date('2026-11-20T12:00:00.000Z'),
    newId: () => ID,
  })

const body = {
  title: 'Rematrícula EAD',
  businessUnit: 'ead',
  channel: 'whatsapp',
  budgetCents: 0,
  startDate: '2026-11-24',
  endDate: '2026-11-28',
}

describe('API de solicitações', () => {
  it('responde health', async () => {
    const response = await setup().inject({ method: 'GET', url: '/health' })
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('exige usuário autenticado', async () => {
    const response = await setup().inject({
      method: 'POST',
      url: '/campaign-requests',
      payload: body,
    })
    expect(response.statusCode).toBe(401)
  })

  it('valida o corpo da requisição', async () => {
    const response = await setup().inject({
      method: 'POST',
      url: '/campaign-requests',
      headers: { 'x-user-id': 'ana' },
      payload: { ...body, channel: 'fax' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('devolve 422 para regra de negócio violada', async () => {
    const response = await setup().inject({
      method: 'POST',
      url: '/campaign-requests',
      headers: { 'x-user-id': 'ana' },
      payload: { ...body, startDate: '2026-11-21' },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ error: { code: 'LEAD_TIME' } })
  })

  it('cria, envia, aprova e consulta', async () => {
    const app = setup()
    const created = await app.inject({
      method: 'POST',
      url: '/campaign-requests',
      headers: { 'x-user-id': 'ana' },
      payload: body,
    })
    expect(created.statusCode).toBe(201)

    await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/submit`,
      headers: { 'x-user-id': 'ana' },
    })

    const self = await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/approve`,
      headers: { 'x-user-id': 'ana' },
    })
    expect(self.statusCode).toBe(403)

    const approved = await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/approve`,
      headers: { 'x-user-id': 'bruno' },
    })
    expect(approved.json()).toMatchObject({ status: 'approved' })

    const fetched = await app.inject({ method: 'GET', url: `/campaign-requests/${ID}` })
    expect(fetched.json()).toMatchObject({ status: 'approved', approvals: ['bruno'] })
  })

  it('devolve 404 e 400 nas consultas inválidas', async () => {
    const app = setup()
    expect((await app.inject({ method: 'GET', url: `/campaign-requests/${ID}` })).statusCode).toBe(
      404,
    )
    expect((await app.inject({ method: 'GET', url: '/campaign-requests/abc' })).statusCode).toBe(
      400,
    )
    const missing = await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/cancel`,
      headers: { 'x-user-id': 'ana' },
    })
    expect(missing.statusCode).toBe(404)
  })

  it('devolve 409 em transição inválida', async () => {
    const app = setup()
    await app.inject({
      method: 'POST',
      url: '/campaign-requests',
      headers: { 'x-user-id': 'ana' },
      payload: body,
    })
    const response = await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/schedule`,
      headers: { 'x-user-id': 'ana' },
    })
    expect(response.statusCode).toBe(409)
  })
})

describe('rejeição com motivo pela API', () => {
  const createAndSubmit = async () => {
    const app = setup()
    await app.inject({
      method: 'POST',
      url: '/campaign-requests',
      headers: { 'x-user-id': 'ana' },
      payload: body,
    })
    await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/submit`,
      headers: { 'x-user-id': 'ana' },
    })
    return app
  }

  it('devolve 422 sem motivo', async () => {
    const app = await createAndSubmit()
    const response = await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/reject`,
      headers: { 'x-user-id': 'bruno' },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REASON' } })
  })

  it('rejeita e devolve o motivo na consulta', async () => {
    const app = await createAndSubmit()
    const rejected = await app.inject({
      method: 'POST',
      url: `/campaign-requests/${ID}/reject`,
      headers: { 'x-user-id': 'bruno' },
      payload: { reason: 'Período conflita com outra campanha' },
    })
    expect(rejected.statusCode).toBe(200)
    const fetched = await app.inject({ method: 'GET', url: `/campaign-requests/${ID}` })
    expect(fetched.json()).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Período conflita com outra campanha',
    })
  })
})

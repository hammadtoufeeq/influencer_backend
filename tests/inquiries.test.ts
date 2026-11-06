import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

let app: Express

beforeAll(async () => {
  app = await setupApp('inquiries')
})
afterAll(teardownDb)

const body = (personId: string, extra: Record<string, unknown> = {}) => ({
  personId,
  name: 'Guest Brand',
  email: 'Guest@Example.com',
  phone: '+92 300 1234567',
  message: 'Is this talent available for a campaign in December?',
  ...extra,
})

describe('talent inquiries', () => {
  it('lets a guest send a query that reaches the admins', async () => {
    const admin = await loginAs(app, 'admin')
    const person = await createPerson({ name: 'Query Talent' })

    const res = await request(app)
      .post('/api/inquiries')
      .send(body(String(person._id)))
    expect(res.status).toBe(201)
    expect(res.body.data.inquiry.status).toBe('new')

    const list = await admin.agent.get('/api/admin/inquiries')
    expect(list.status).toBe(200)
    const found = list.body.data.inquiries.find(
      (i: { _id: string }) => i._id === res.body.data.inquiry._id,
    )
    expect(found).toMatchObject({ name: 'Guest Brand', email: 'guest@example.com', status: 'new' })
    expect(found.person.name).toBe('Query Talent')

    const notes = await admin.agent.get('/api/notifications')
    expect(JSON.stringify(notes.body)).toContain('inquiry.new')
  })

  it('validates the form and ignores bots', async () => {
    const person = await createPerson()
    const bad = await request(app)
      .post('/api/inquiries')
      .send(body(String(person._id), { email: 'nope', message: 'short' }))
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields.email).toBeDefined()
    expect(bad.body.error.fields.message).toBeDefined()

    const { Inquiry } = await import('../src/models/Inquiry')
    const before = await Inquiry.countDocuments()
    const bot = await request(app)
      .post('/api/inquiries')
      .send(body(String(person._id), { website: 'http://spam.example' }))
    expect(bot.status).toBe(201)
    expect(await Inquiry.countDocuments()).toBe(before)
  })

  it('refuses hidden or missing profiles', async () => {
    const hidden = await createPerson({ visibility: 'hidden' })
    expect(
      (
        await request(app)
          .post('/api/inquiries')
          .send(body(String(hidden._id)))
      ).status,
    ).toBe(404)
  })

  it('lets only admins read and update queries', async () => {
    const admin = await loginAs(app, 'admin')
    const talent = await loginAs(app, 'talent')
    const person = await createPerson()
    const sent = await talent.agent.post('/api/inquiries').send(body(String(person._id)))
    const id = sent.body.data.inquiry._id

    expect((await talent.agent.get('/api/admin/inquiries')).status).toBe(403)
    expect((await request(app).get(`/api/admin/inquiries/${id}`)).status).toBe(401)

    const updated = await admin.agent
      .patch(`/api/admin/inquiries/${id}`)
      .send({ status: 'answered', adminNote: 'Replied by email' })
    expect(updated.status).toBe(200)
    expect(updated.body.data.inquiry).toMatchObject({
      status: 'answered',
      adminNote: 'Replied by email',
    })
    expect(updated.body.data.inquiry.user.email).toBe(talent.user.email)

    const detail = await admin.agent.get(`/api/admin/inquiries/${id}`)
    expect(detail.body.data.history[0].action).toBe('inquiry.update')
    expect(
      (await admin.agent.patch(`/api/admin/inquiries/${id}`).send({ status: 'new' })).status,
    ).toBe(400)
  })
})

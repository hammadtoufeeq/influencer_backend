import type { Express } from 'express'
import type request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'

// Asal Cloudinary nahi: upload_stream / destroy ka nakli roop
const mockUploads: Record<string, unknown>[] = []
const mockDestroyed: string[] = []
let mockCounter = 0
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: (
        options: Record<string, unknown>,
        done: (error: unknown, result?: { secure_url: string }) => void,
      ) => ({
        end: () => {
          mockUploads.push(options)
          mockCounter += 1
          done(undefined, {
            secure_url: `https://res.cloudinary.com/demo-cloud/image/upload/v1/${options.folder}/pic${mockCounter}.png`,
          })
        },
      }),
      destroy: jest.fn(async (publicId: string) => {
        mockDestroyed.push(publicId)
        return { result: 'ok' }
      }),
    },
  },
}))

let app: Express

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const upload = (agent: request.Agent, url: string) =>
  agent.put(url).attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' })

beforeAll(async () => {
  app = await setupApp('cloudinary_uploads')
  const { env } = await import('../src/config/env')
  env.cloudinaryUrl = 'cloudinary://key123:secret456@demo-cloud'
  env.cloudinaryFolder = 'influencer-platform'
})
afterAll(async () => {
  const { env } = await import('../src/config/env')
  env.cloudinaryUrl = ''
  await teardownDb()
})

describe('Cloudinary uploads', () => {
  it('sends every account photo and logo to Cloudinary and deletes the old one', async () => {
    for (const role of ['talent', 'representative', 'business'] as const) {
      const { agent } = await loginAs(app, role)
      const first = await upload(agent, '/api/account/avatar')
      expect(first.status).toBe(200)
      const url = first.body.data.user.avatarUrl as string
      expect(url).toMatch(
        /^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/upload\/f_auto,q_auto\/v1\/influencer-platform\/pic\d+\.png$/,
      )
      expect(mockUploads.at(-1)).toMatchObject({
        folder: 'influencer-platform',
        resource_type: 'image',
      })

      const second = await upload(agent, '/api/account/avatar')
      expect(second.status).toBe(200)
      const oldId = url.split('/').pop()!.replace('.png', '')
      expect(mockDestroyed).toContain(`influencer-platform/${oldId}`)

      const removed = await agent.delete('/api/account/avatar')
      expect(removed.status).toBe(200)
      const secondId = (second.body.data.user.avatarUrl as string)
        .split('/')
        .pop()!
        .replace('.png', '')
      expect(mockDestroyed).toContain(`influencer-platform/${secondId}`)
    }
  })

  it('never deletes images that are not ours', async () => {
    const { removeImage } = await import('../src/services/imageStorage')
    const before = mockDestroyed.length
    await removeImage(
      'https://res.cloudinary.com/other-cloud/image/upload/v1/influencer-platform/x.png',
    )
    await removeImage('https://upload.wikimedia.org/some/photo.jpg')
    expect(mockDestroyed.length).toBe(before)
  })

  it('lets a talent add a photo to the profile they just submitted', async () => {
    const talent = await loginAs(app, 'talent')
    const other = await loginAs(app, 'talent')
    const sent = await talent.agent.post('/api/claims/new-profile').send({
      name: `Photo Talent ${Date.now()}`,
      socialAccounts: [{ platform: 'instagram', url: `https://instagram.com/photo_${Date.now()}` }],
    })
    expect(sent.status).toBe(201)
    const personId = sent.body.data.claim.person._id as string

    const res = await upload(talent.agent, `/api/people/${personId}/photo`)
    expect(res.status).toBe(200)
    expect(res.body.data.photoUrl).toMatch(/^https:\/\/res\.cloudinary\.com\/demo-cloud\//)

    // Kisi aur ki draft profile pe nahi
    expect((await upload(other.agent, `/api/people/${personId}/photo`)).status).toBe(403)
    // Aam unclaimed profile pe talent nahi
    const stranger = await createPerson()
    expect((await upload(talent.agent, `/api/people/${stranger._id}/photo`)).status).toBe(403)
  })
})

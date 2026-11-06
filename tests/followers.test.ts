import type { Express } from 'express'
import request from 'supertest'
import { createPerson, loginAs, setupApp, teardownDb } from './helpers'
import { parseFollowerCount } from '../src/services/followers/parseCount'
import { handleFromUrl, normalizeHandle, urlMatchesHandle } from '../src/utils/socialHandle'
import { isDue, mergeSocialAccounts } from '../src/services/followerService'

let app: Express

beforeAll(async () => {
  app = await setupApp('followers')
})
afterAll(teardownDb)
afterEach(() => jest.restoreAllMocks())

// Tavily / YouTube ka nakli jawab
function mockFetch(body: unknown, ok = true) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body } as Response)
}

describe('parseFollowerCount', () => {
  it.each([
    ['5.4M Followers, 300 Following, 1,200 Posts', 5_400_000],
    ['12.3K followers', 12_300],
    ['1.2B followers', 1_200_000_000],
    ['1,234,567 Followers', 1_234_567],
    ['2.1 million followers on TikTok', 2_100_000],
    ['Followers: 980K', 980_000],
    ['45 subscribers', 45],
    ['1.2M likes · 15K talking about this · 2M followers', 2_000_000],
  ])('%s', (text, expected) => {
    expect(parseFollowerCount(text)).toBe(expected)
  })

  it.each([['300 Following'], ['5.4 followers'], ['no numbers here'], ['999999999999 followers']])(
    'ignores %s',
    (text) => {
      expect(parseFollowerCount(text)).toBeNull()
    },
  )
})

describe('handles', () => {
  it('reads the handle from profile links', () => {
    expect(handleFromUrl('instagram', 'https://www.instagram.com/BabarAzam/')).toBe('babarazam')
    expect(handleFromUrl('youtube', 'https://youtube.com/@Ducky')).toBe('ducky')
    expect(
      handleFromUrl('youtube', 'https://www.youtube.com/channel/UC1234567890123456789012'),
    ).toBe('UC1234567890123456789012')
    expect(handleFromUrl('tiktok', 'https://www.tiktok.com/@some.user')).toBe('some.user')
    expect(handleFromUrl('x', 'https://twitter.com/someone')).toBe('someone')
    expect(handleFromUrl('facebook', 'https://facebook.com/profile.php?id=123')).toBeUndefined()
    expect(handleFromUrl('instagram', 'https://instagram.com/p/abc123')).toBeUndefined()
    expect(handleFromUrl('instagram', 'https://example.com/babar')).toBeUndefined()
  })

  it('cleans a typed handle and falls back to the link', () => {
    expect(normalizeHandle('instagram', ' @Babar ', 'https://instagram.com/other')).toBe('babar')
    expect(normalizeHandle('instagram', '', 'https://instagram.com/other')).toBe('other')
    expect(normalizeHandle('instagram', 'https://instagram.com/typed', 'https://x.y')).toBe('typed')
  })

  it('only trusts pages of the exact account', () => {
    expect(urlMatchesHandle('instagram', 'https://www.instagram.com/babarazam/', 'babarazam')).toBe(
      true,
    )
    expect(urlMatchesHandle('instagram', 'https://instagram.com/babarazamfans', 'babarazam')).toBe(
      false,
    )
    expect(urlMatchesHandle('instagram', 'https://instagram.com/p/xyz', 'babarazam')).toBe(false)
  })
})

describe('mergeSocialAccounts', () => {
  it('keeps fetched data for the same account and clears it when the handle changes', () => {
    const checkedAt = new Date('2026-01-01')
    const existing = [
      {
        platform: 'instagram' as const,
        handle: 'babar',
        url: 'https://instagram.com/babar',
        followers: 5_000_000,
        followersCheckedAt: checkedAt,
        followersStatus: 'ok' as const,
      },
      {
        platform: 'tiktok' as const,
        handle: 'old',
        url: 'https://tiktok.com/@old',
        followers: 100,
      },
    ]
    const merged = mergeSocialAccounts(existing, [
      { platform: 'instagram', url: 'https://instagram.com/Babar' },
      { platform: 'tiktok', url: 'https://tiktok.com/@new' },
    ])
    expect(merged[0]).toMatchObject({
      handle: 'babar',
      followers: 5_000_000,
      followersCheckedAt: checkedAt,
    })
    expect(merged[1].handle).toBe('new')
    expect(merged[1].followers).toBeUndefined()
  })

  it('knows when an account is due', () => {
    const now = new Date('2026-02-01')
    const base = { platform: 'instagram' as const, handle: 'a', url: 'https://instagram.com/a' }
    expect(isDue(base, now)).toBe(true)
    expect(isDue({ ...base, followersCheckedAt: new Date('2026-01-30') }, now)).toBe(false)
    expect(isDue({ ...base, followersCheckedAt: new Date('2026-01-20') }, now)).toBe(true)
    // 3 dafa nahi mila: mahine mein ek dafa
    expect(
      isDue({ ...base, followersCheckedAt: new Date('2026-01-20'), followersFailCount: 3 }, now),
    ).toBe(false)
    expect(isDue({ ...base, platform: 'linkedin' }, now)).toBe(false)
  })
})

describe('profile edits', () => {
  it('ignores followers sent by the talent and keeps fetched numbers', async () => {
    const talent = await loginAs(app, 'talent')
    const person = await createPerson({
      claimedBy: talent.user._id,
      socialAccounts: [
        {
          platform: 'instagram',
          handle: 'me',
          url: 'https://instagram.com/me',
          followers: 12_000,
          followersCheckedAt: new Date(),
          followersStatus: 'ok',
        },
      ],
    })

    const res = await talent.agent.patch(`/api/people/${person._id}`).send({
      headline: 'Creator',
      socialAccounts: [
        { platform: 'instagram', url: 'https://instagram.com/me', followers: 9_999_999 },
        { platform: 'youtube', url: 'https://youtube.com/@mychannel', followers: 5 },
      ],
    })
    expect(res.status).toBe(200)
    const accounts = res.body.data.person.socialAccounts
    expect(accounts[0].followers).toBe(12_000)
    expect(accounts[1].handle).toBe('mychannel')
    expect(accounts[1].followers).toBeUndefined()
    expect(res.body.data.person.totalFollowers).toBe(12_000)
  })

  it('fetches followers through Tavily for the exact account only', async () => {
    const { env } = await import('../src/config/env')
    env.tavilyApiKey = 'test-key'
    try {
      const talent = await loginAs(app, 'talent')
      const person = await createPerson({ claimedBy: talent.user._id })
      const fetchMock = mockFetch({
        results: [
          { url: 'https://instagram.com/starfan', content: '9M Followers' },
          {
            url: 'https://www.instagram.com/star/',
            title: 'Star',
            content: '5.4M Followers, 10 Following',
          },
        ],
      })

      const res = await talent.agent.patch(`/api/people/${person._id}`).send({
        socialAccounts: [{ platform: 'instagram', url: 'https://instagram.com/star' }],
      })
      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [account] = res.body.data.person.socialAccounts
      expect(account.followers).toBe(5_400_000)
      expect(account.followersSourceUrl).toBe('https://www.instagram.com/star/')
      expect(account.followersStatus).toBe('ok')
      expect(res.body.data.person.totalFollowers).toBe(5_400_000)

      // Limit lagi ho (24 ghante): dobara nahi, na button se na save se
      env.followersRefreshLimitHours = 24
      const again = await talent.agent.post(`/api/people/${person._id}/refresh-followers`)
      expect(again.status).toBe(429)
      expect(again.body.error.code).toBe('REFRESH_TOO_SOON')

      const resave = await talent.agent.patch(`/api/people/${person._id}`).send({
        socialAccounts: [
          { platform: 'instagram', url: 'https://instagram.com/star' },
          { platform: 'tiktok', url: 'https://tiktok.com/@star' },
        ],
      })
      expect(resave.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [kept, waiting] = resave.body.data.person.socialAccounts
      expect(kept.followers).toBe(5_400_000)
      expect(waiting.followersCheckedAt).toBeUndefined()

      // Limit na ho (default): button jitni dafa chahe
      env.followersRefreshLimitHours = 0
      const first = await talent.agent.post(`/api/people/${person._id}/refresh-followers`)
      const second = await talent.agent.post(`/api/people/${person._id}/refresh-followers`)
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      // Har refresh: Instagram ki search (mili) + TikTok ki search aur us ke page ka Extract
      expect(fetchMock).toHaveBeenCalledTimes(7)
    } finally {
      env.tavilyApiKey = ''
      env.followersRefreshLimitHours = 0
    }
  })

  it('reads the profile page when search does not know the account', async () => {
    const { env } = await import('../src/config/env')
    env.tavilyApiKey = 'test-key'
    try {
      const talent = await loginAs(app, 'talent')
      const person = await createPerson({ claimedBy: talent.user._id })
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
        const body = String(url).includes('/extract')
          ? {
              results: [
                {
                  url: 'https://www.instagram.com/small_creator/',
                  raw_content: '1,234 Followers, 210 Following, 35 Posts',
                },
              ],
            }
          : {
              results: [
                { url: 'https://www.instagram.com/someone_else/', content: '9M Followers' },
              ],
            }
        return { ok: true, status: 200, json: async () => body } as Response
      })

      const res = await talent.agent.patch(`/api/people/${person._id}`).send({
        socialAccounts: [{ platform: 'instagram', url: 'https://instagram.com/small_creator' }],
      })
      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [account] = res.body.data.person.socialAccounts
      expect(account.followers).toBe(1234)
      expect(account.followersSourceUrl).toBe('https://www.instagram.com/small_creator/')
    } finally {
      env.tavilyApiKey = ''
    }
  })

  it('keeps the old number when a lookup finds nothing', async () => {
    const { env } = await import('../src/config/env')
    const { Person } = await import('../src/models/Person')
    env.tavilyApiKey = 'test-key'
    try {
      const talent = await loginAs(app, 'talent')
      const person = await createPerson({
        claimedBy: talent.user._id,
        socialAccounts: [
          {
            platform: 'tiktok',
            handle: 'dancer',
            url: 'https://tiktok.com/@dancer',
            followers: 800,
            followersCheckedAt: new Date('2020-01-01'),
          },
        ],
      })
      mockFetch({ results: [{ url: 'https://tiktok.com/@dancer', content: 'Watch my videos' }] })

      const res = await talent.agent.post(`/api/people/${person._id}/refresh-followers`)
      expect(res.status).toBe(200)
      const saved = await Person.findById(person._id)
      expect(saved?.socialAccounts[0].followers).toBe(800)
      expect(saved?.socialAccounts[0].followersStatus).toBe('not_found')
      expect(saved?.socialAccounts[0].followersFailCount).toBe(1)
    } finally {
      env.tavilyApiKey = ''
    }
  })

  it('does not let other users refresh a profile', async () => {
    const owner = await loginAs(app, 'talent')
    const other = await loginAs(app, 'talent')
    const person = await createPerson({ claimedBy: owner.user._id })
    const res = await other.agent.post(`/api/people/${person._id}/refresh-followers`)
    expect(res.status).toBe(403)
  })
})

describe('followers cron', () => {
  it('needs the cron secret', async () => {
    const res = await request(app).get('/api/cron/followers')
    expect(res.status).toBe(401)
    const wrong = await request(app).get('/api/cron/followers').set('Authorization', 'Bearer nope')
    expect(wrong.status).toBe(401)
  })

  it('refreshes due YouTube accounts and skips demo profiles', async () => {
    const { env } = await import('../src/config/env')
    const { Person } = await import('../src/models/Person')
    env.youtubeApiKey = 'test-key'
    try {
      const person = await createPerson({
        socialAccounts: [
          { platform: 'youtube', handle: 'cronchannel', url: 'https://youtube.com/@cronchannel' },
        ],
      })
      const demo = await createPerson({
        isDemo: true,
        socialAccounts: [{ platform: 'youtube', handle: 'demo', url: 'https://youtube.com/@demo' }],
      })
      mockFetch({
        items: [{ id: 'UC1234567890123456789012', statistics: { subscriberCount: '1230000' } }],
      })

      const res = await request(app)
        .get('/api/cron/followers')
        .set('Authorization', `Bearer ${process.env.CRON_SECRET}`)
      expect(res.status).toBe(200)

      const saved = await Person.findById(person._id)
      expect(saved?.socialAccounts[0].followers).toBe(1_230_000)
      expect(saved?.totalFollowers).toBe(1_230_000)
      const untouched = await Person.findById(demo._id)
      expect(untouched?.socialAccounts[0].followersCheckedAt).toBeUndefined()
    } finally {
      env.youtubeApiKey = ''
    }
  })
})

import type { HydratedDocument } from 'mongoose'
import { FOLLOWER_PLATFORMS, type FollowerPlatform, type SocialPlatform } from '../constants/people'
import { Person, type IPerson, type ISocialAccount } from '../models/Person'
import { normalizeHandle } from '../utils/socialHandle'
import { tavilyFollowers } from './followers/tavily'
import type { LookupResult } from './followers/types'
import { youtubeFollowers } from './followers/youtube'

const DAY = 24 * 60 * 60 * 1000
// Hafte mein ek dafa. Jo account 3 dafa lagatar na mile, us ko mahine mein ek dafa
export const REFRESH_EVERY_MS = 7 * DAY
const FAILING_REFRESH_EVERY_MS = 28 * DAY
const FAILING_AFTER = 3
// Roz ke cron mein itne profiles (40 talents hafte mein poore ho jate hain)
export const CRON_BATCH = 10

// Form se aane wala account (followers kabhi client se nahi aate)
export interface SocialAccountInput {
  platform: SocialPlatform
  handle?: string
  url: string
  engagementRate?: number
}

const FOLLOWER_FIELDS = [
  'followers',
  'followersSourceUrl',
  'followersUpdatedAt',
  'followersCheckedAt',
  'followersStatus',
  'followersFailCount',
] as const

export function isFollowerPlatform(platform: SocialPlatform): platform is FollowerPlatform {
  return (FOLLOWER_PLATFORMS as readonly string[]).includes(platform)
}

function sameAccount(a: Pick<ISocialAccount, 'platform' | 'handle' | 'url'>, b: typeof a) {
  if (a.platform !== b.platform) return false
  if (a.handle && b.handle) return a.handle.toLowerCase() === b.handle.toLowerCase()
  return a.url.replace(/\/+$/, '').toLowerCase() === b.url.replace(/\/+$/, '').toLowerCase()
}

// Profile save pe: form wale accounts, handle saaf / link se nikala hua, aur jo account pehle
// se tha (wahi platform + handle) us ka khud aaya hua followers data waisa hi rehta hai.
// Naya ya badla hua handle = followers khali, agli lookup mein aayenge
export function mergeSocialAccounts(
  existing: ISocialAccount[],
  incoming: SocialAccountInput[],
): ISocialAccount[] {
  return incoming.map((input) => {
    const account: ISocialAccount = {
      platform: input.platform,
      url: input.url,
      handle: normalizeHandle(input.platform, input.handle, input.url) ?? input.handle?.trim(),
      engagementRate: input.engagementRate,
    }
    const before = existing.find((old) => sameAccount(old, account))
    if (before) {
      for (const field of FOLLOWER_FIELDS) {
        if (before[field] !== undefined) Object.assign(account, { [field]: before[field] })
      }
    }
    return account
  })
}

async function lookup(platform: FollowerPlatform, handle: string): Promise<LookupResult> {
  return platform === 'youtube' ? youtubeFollowers(handle) : tavilyFollowers(platform, handle)
}

// Is account ki baari hai? (kabhi nahi dekha, ya hafta guzar gaya)
export function isDue(account: ISocialAccount, now = new Date()) {
  if (!isFollowerPlatform(account.platform) || !account.handle) return false
  if (!account.followersCheckedAt) return true
  const every =
    (account.followersFailCount ?? 0) >= FAILING_AFTER ? FAILING_REFRESH_EVERY_MS : REFRESH_EVERY_MS
  return now.getTime() - account.followersCheckedAt.getTime() >= every
}

// Jin accounts ko chuna un ke followers dhoondo aur profile save karo (total khud banta hai).
// Na mile to purana number rehta hai. Key na lagi ho to us account ko chhote bhi nahi
export async function refreshFollowers(
  person: HydratedDocument<IPerson>,
  pick: (account: ISocialAccount) => boolean = (account) =>
    isFollowerPlatform(account.platform) && Boolean(account.handle),
) {
  const accounts = person.socialAccounts.filter(
    (account) => isFollowerPlatform(account.platform) && account.handle && pick(account),
  )
  if (accounts.length === 0) return { checked: 0, updated: 0 }

  const now = new Date()
  const results = await Promise.all(
    accounts.map((account) => lookup(account.platform as FollowerPlatform, account.handle!)),
  )

  let checked = 0
  let updated = 0
  results.forEach((result, index) => {
    const account = accounts[index]
    if (result.status === 'disabled') return
    checked += 1
    account.followersCheckedAt = now
    if (result.status === 'ok') {
      updated += 1
      account.followers = result.count
      account.followersSourceUrl = result.sourceUrl
      account.followersUpdatedAt = now
      account.followersStatus = 'ok'
      account.followersFailCount = 0
    } else {
      account.followersStatus = result.status
      account.followersFailCount = (account.followersFailCount ?? 0) + 1
    }
  })

  if (checked > 0) await person.save()
  return { checked, updated }
}

// Save ke baad: naye / badle hue accounts (jinhein abhi tak dekha nahi) foran dhoondo.
// Request kabhi is wajah se fail nahi hoti
export async function refreshNewAccounts(person: HydratedDocument<IPerson>) {
  try {
    await refreshFollowers(person, (account) => !account.followersCheckedAt)
  } catch (error) {
    console.error('Followers lookup failed', error)
  }
}

// Roz ka cron: jin profiles ke kisi account ki baari hai, sab se purane pehle
export async function refreshDueBatch(limit = CRON_BATCH) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - REFRESH_EVERY_MS)
  const monthAgo = new Date(now.getTime() - FAILING_REFRESH_EVERY_MS)
  const people = await Person.find({
    isDemo: false,
    socialAccounts: {
      $elemMatch: {
        platform: { $in: FOLLOWER_PLATFORMS },
        handle: { $exists: true, $nin: ['', null] },
        $or: [
          { followersCheckedAt: { $exists: false } },
          {
            followersCheckedAt: { $lt: weekAgo },
            followersFailCount: { $not: { $gte: FAILING_AFTER } },
          },
          { followersCheckedAt: { $lt: monthAgo } },
        ],
      },
    },
  })
    .sort({ 'socialAccounts.followersCheckedAt': 1, _id: 1 })
    .limit(limit)

  let checked = 0
  let updated = 0
  for (const person of people) {
    const result = await refreshFollowers(person, (account) => isDue(account, now))
    checked += result.checked
    updated += result.updated
  }
  return { people: people.length, checked, updated }
}

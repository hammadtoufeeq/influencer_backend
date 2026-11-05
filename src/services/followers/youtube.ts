import { env } from '../../config/env'
import { isYoutubeChannelId } from '../../utils/socialHandle'
import type { LookupResult } from './types'

const API = 'https://www.googleapis.com/youtube/v3/channels'

interface ChannelsResponse {
  items?: {
    id: string
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean }
  }[]
}

async function fetchChannel(params: Record<string, string>) {
  const query = new URLSearchParams({ part: 'statistics', key: env.youtubeApiKey, ...params })
  const res = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`YouTube API ${res.status}`)
  const data = (await res.json()) as ChannelsResponse
  return data.items?.[0]
}

// YouTube Data API v3 (free, 1 unit fi call): subscribers seedhe channel se.
// Handle (@name), purana username, ya channel ID (UC...) teeno chalte hain
export async function youtubeFollowers(handle: string): Promise<LookupResult> {
  if (!env.youtubeApiKey) return { status: 'disabled' }
  try {
    const channel = isYoutubeChannelId(handle)
      ? await fetchChannel({ id: handle })
      : ((await fetchChannel({ forHandle: `@${handle}` })) ??
        (await fetchChannel({ forUsername: handle })))
    const stats = channel?.statistics
    // Channel ne subscribers chhupa rakhe hain to number nahi
    if (!channel || !stats || stats.hiddenSubscriberCount || stats.subscriberCount === undefined) {
      return { status: 'not_found' }
    }
    const count = Number(stats.subscriberCount)
    if (!Number.isFinite(count) || count < 0) return { status: 'not_found' }
    return { status: 'ok', count, sourceUrl: `https://www.youtube.com/channel/${channel.id}` }
  } catch {
    return { status: 'error' }
  }
}

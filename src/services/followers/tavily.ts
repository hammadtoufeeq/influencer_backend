import { env } from '../../config/env'
import type { FollowerPlatform } from '../../constants/people'
import { urlMatchesHandle } from '../../utils/socialHandle'
import { groqExtractCount } from './groq'
import { parseFollowerCount } from './parseCount'
import type { LookupResult } from './types'

const API = 'https://api.tavily.com/search'

type TavilyPlatform = Exclude<FollowerPlatform, 'youtube'>

const DOMAINS: Record<TavilyPlatform, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com'],
  x: ['x.com', 'twitter.com'],
  tiktok: ['tiktok.com'],
}

const NAMES: Record<TavilyPlatform, string> = {
  instagram: 'instagram',
  facebook: 'facebook',
  x: 'x twitter',
  tiktok: 'tiktok',
}

interface SearchResponse {
  results?: { url?: string; title?: string; content?: string }[]
}

// Tavily search (1 credit): sirf us platform ki site pe handle dhoondo, aur sirf usi
// account ke page ke text se number lo. Andaza hai: search index jitna purana ho
export async function tavilyFollowers(
  platform: TavilyPlatform,
  handle: string,
): Promise<LookupResult> {
  if (!env.tavilyApiKey) return { status: 'disabled' }

  let data: SearchResponse
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.tavilyApiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        query: `${handle} ${NAMES[platform]} followers`,
        include_domains: DOMAINS[platform],
        search_depth: 'basic',
        max_results: 5,
      }),
    })
    if (!res.ok) return { status: 'error' }
    data = (await res.json()) as SearchResponse
  } catch {
    return { status: 'error' }
  }

  // Sirf usi handle ke pages (instagram.com/babarazam, /babarazamfans nahi)
  const pages = (data.results ?? []).filter(
    (result) => result.url && urlMatchesHandle(platform, result.url, handle),
  )
  for (const page of pages) {
    const count = parseFollowerCount(`${page.title ?? ''}\n${page.content ?? ''}`)
    if (count !== null) return { status: 'ok', count, sourceUrl: page.url! }
  }
  // Regex se nahi mila: Groq (agar laga ho) usi text mein se dhoonde
  for (const page of pages) {
    const text = `${page.title ?? ''}\n${page.content ?? ''}`
    if (!/follower|subscriber/i.test(text)) continue
    const count = await groqExtractCount(text, handle)
    if (count !== null) return { status: 'ok', count, sourceUrl: page.url! }
  }
  return { status: 'not_found' }
}

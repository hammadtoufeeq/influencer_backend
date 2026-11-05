// Profile ki 4 states (document Section 1)
export const PROFILE_STATUSES = ['public', 'contactable', 'represented', 'hireable'] as const
export type ProfileStatus = (typeof PROFILE_STATUSES)[number]

export const SOCIAL_PLATFORMS = [
  'instagram',
  'youtube',
  'tiktok',
  'x',
  'facebook',
  'linkedin',
  'snapchat',
  'twitch',
  'podcast',
  'website',
  'other',
] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

// In platforms ke followers khud aate hain (YouTube API, baqi Tavily search). Baqi ke nahi dikhte
export const FOLLOWER_PLATFORMS = ['instagram', 'youtube', 'facebook', 'x', 'tiktok'] as const
export type FollowerPlatform = (typeof FOLLOWER_PLATFORMS)[number]

// Aakhri dafa followers dhoondne ka nateeja
export const FOLLOWER_STATUSES = ['ok', 'not_found', 'error'] as const
export type FollowerStatus = (typeof FOLLOWER_STATUSES)[number]

// Data kahan se aaya (har seeded Person ke liye zaroori)
export const SOURCE_TYPES = ['public_web', 'research_sheet', 'self_submitted', 'admin', 'demo', 'wikipedia'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

// ISO 639-1 language codes jo abhi support karte hain
export const LANGUAGE_CODES = ['en', 'ur', 'ar', 'pa', 'sd', 'ps', 'hi', 'fa', 'tr', 'fr'] as const

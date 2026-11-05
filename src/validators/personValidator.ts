import { z } from 'zod'
import { webUrl } from './common'
import {
  LANGUAGE_CODES,
  PROFILE_STATUSES,
  SOCIAL_PLATFORMS,
  SOURCE_TYPES,
} from '../constants/people'
import { OPEN_TO } from '../constants/services'

// Khali string bhejo to field saaf ho jaye
const optionalUrl = z.union([webUrl('Enter a valid URL'), z.literal('')]).optional()
// Photo: bahar ka link, ya hamari apni save ki hui photo (seed se)
const photoUrl = z
  .union([
    webUrl('Enter a valid URL'),
    z.string().regex(/^\/api\/people\/photos\/[a-f0-9]{24}$/),
    // Upload ki hui photo
    z.string().regex(/^\/api\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/),
    z.literal(''),
  ])
  .optional()
const slugList = z.array(z.string().trim().toLowerCase().min(1)).max(10)

const socialAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().trim().max(100).optional(),
  url: webUrl('Enter a valid URL'),
  // followers yahan nahi: woh khud aate hain (talent / admin haath se nahi likhte)
  engagementRate: z.number().min(0).max(100).optional(),
})

const sourceRecordSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  url: webUrl().optional(),
  note: z.string().trim().max(500).optional(),
})

// Ye fields claimed owner bhi badal sakta hai
const editableFields = {
  headline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(3000).optional(),
  photoUrl,
  websiteUrl: optionalUrl,
  languages: z.array(z.enum(LANGUAGE_CODES)).max(10).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a 2-letter country code, e.g. PK')
    .optional(),
  city: z.string().trim().max(80).optional(),
  socialAccounts: z.array(socialAccountSchema).max(20).optional(),
  professions: slugList.optional(),
  industries: slugList.optional(),
  topics: slugList.optional(),
}

// Ye fields sirf admin badal sakta hai
const adminOnlyFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  status: z.enum(PROFILE_STATUSES),
  verified: z.boolean(),
  visibility: z.enum(['visible', 'hidden']),
}

export const createPersonSchema = z.object({
  ...editableFields,
  name: adminOnlyFields.name,
  status: adminOnlyFields.status.optional(),
  verified: adminOnlyFields.verified.optional(),
  sourceRecords: z.array(sourceRecordSchema).max(20).optional(),
})

export const updatePersonSchema = z.object(editableFields)

export const adminUpdatePersonSchema = z.object({
  ...editableFields,
  name: adminOnlyFields.name.optional(),
  status: adminOnlyFields.status.optional(),
  verified: adminOnlyFields.verified.optional(),
  visibility: adminOnlyFields.visibility.optional(),
})

// "journalist,tv-host" -> ['journalist', 'tv-host']
const commaList = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.split(',').map((s) => s.trim()).filter(Boolean))

export const listPeopleQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  profession: commaList.optional(),
  industry: commaList.optional(),
  topic: commaList.optional(),
  // Ek ya kai mulk: "PK" ya "PK,AE"
  country: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => value.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[A-Z]{2}$/, 'Use 2-letter country codes')).max(20))
    .optional(),
  city: z.string().trim().max(80).optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  minFollowers: z.coerce.number().int().min(0).optional(),
  status: z.enum(PROFILE_STATUSES).optional(),
  // Sirf woh log jo is kaam ke liye abhi khule hain (speaking, campaigns...)
  openTo: z.enum(OPEN_TO).optional(),
  // Browse pe kai cheezen chun kar: all = har chuni cheez match ho, any = koi bhi ek.
  // Na ho to: ek qism ke andar koi bhi, alag qismen sab (purana tareeqa)
  match: z.enum(['all', 'any']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['followers', 'newest', 'name']).default('followers'),
})

export type CreatePersonInput = z.infer<typeof createPersonSchema>
export type AdminUpdatePersonInput = z.infer<typeof adminUpdatePersonSchema>
export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>

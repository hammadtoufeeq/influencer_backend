import { Schema, model, type Types } from 'mongoose'
import {
  FOLLOWER_STATUSES,
  LANGUAGE_CODES,
  PROFILE_STATUSES,
  SOCIAL_PLATFORMS,
  SOURCE_TYPES,
  type FollowerStatus,
  type ProfileStatus,
  type SocialPlatform,
  type SourceType,
} from '../constants/people'
import {
  CURRENCIES,
  OPEN_TO,
  PRICE_UNITS,
  PRICING_TYPES,
  RESPONSE_TIMES,
  SERVICE_CATEGORIES,
} from '../constants/services'

// Person = public profile. Login account (User) alag hai.
// Person pehle se mojood ho sakta hai, user baad mein "claim" karta hai
export interface ISocialAccount {
  platform: SocialPlatform
  handle?: string
  url: string
  // Khud aate hain (talent haath se nahi likhta). Andaza: public profile se
  followers?: number
  engagementRate?: number
  // Number kis page se mila aur kab
  followersSourceUrl?: string
  followersUpdatedAt?: Date
  // Aakhri koshish kab hui, kya nateeja, aur lagatar kitni dafa nahi mila
  followersCheckedAt?: Date
  followersStatus?: FollowerStatus
  followersFailCount?: number
}

export interface ISourceRecord {
  sourceType: SourceType
  url?: string
  note?: string
  retrievedAt: Date
}

// Talent ki pesh ki hui service (jaise keynote talk, brand campaign)
export interface IService {
  _id: Types.ObjectId
  title: string
  category: (typeof SERVICE_CATEGORIES)[number]
  description?: string
  pricing: {
    type: (typeof PRICING_TYPES)[number]
    currency: (typeof CURRENCIES)[number]
    amount?: number
    min?: number
    max?: number
    unit: (typeof PRICE_UNITS)[number]
  }
  deliveryDays?: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// Abhi naya kaam le raha hai ya nahi, aur kis qism ka
export interface IAvailability {
  isOpen: boolean
  openTo: (typeof OPEN_TO)[number][]
  responseTime?: (typeof RESPONSE_TIMES)[number]
  availableFrom?: Date
  note?: string
  updatedAt?: Date
}

// Photo kahan se aayi aur kis license pe (jaise Wikimedia Commons, CC BY-SA 4.0)
export interface IPhotoCredit {
  provider: string
  author?: string
  license: string
  licenseUrl?: string
  sourceUrl: string
}

export interface IPerson {
  name: string
  slug: string
  headline?: string
  bio?: string
  photoUrl?: string
  photoCredit?: IPhotoCredit
  // Profile kis qism ke account ke liye hai (abhi sab "talent")
  roles: string[]
  services: IService[]
  availability?: IAvailability
  status: ProfileStatus
  professions: Types.ObjectId[]
  industries: Types.ObjectId[]
  topics: Types.ObjectId[]
  languages: string[]
  country?: string
  city?: string
  websiteUrl?: string
  socialAccounts: ISocialAccount[]
  // Saare social accounts ke followers ka jor (search filter ke liye)
  totalFollowers: number
  claimedBy: Types.ObjectId | null
  representedBy: Types.ObjectId[]
  verified: boolean
  visibility: 'visible' | 'hidden'
  sourceRecords: ISourceRecord[]
  // Sample data jo baad mein ek command se hataya ja sake
  isDemo: boolean
  // Talent ki khud bheji hui profile: claim approve hone tak chhupi (visibility hidden)
  isDraft: boolean
  // Claim se pehle ki public-source shakal. Maalik account mitaye to yahi wapas aati hai,
  // taake us ki likhi baatein "unclaimed" profile pe na reh jayen
  publicSnapshot?: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

const socialAccountSchema = new Schema<ISocialAccount>(
  {
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    handle: { type: String, trim: true },
    url: { type: String, required: true, trim: true },
    followers: { type: Number, min: 0 },
    engagementRate: { type: Number, min: 0, max: 100 },
    followersSourceUrl: { type: String, trim: true },
    followersUpdatedAt: { type: Date },
    followersCheckedAt: { type: Date },
    followersStatus: { type: String, enum: FOLLOWER_STATUSES },
    followersFailCount: { type: Number, min: 0 },
  },
  { _id: false },
)

const sourceRecordSchema = new Schema<ISourceRecord>(
  {
    sourceType: { type: String, enum: SOURCE_TYPES, required: true },
    url: { type: String, trim: true },
    note: { type: String, trim: true },
    retrievedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const photoCreditSchema = new Schema<IPhotoCredit>(
  {
    provider: { type: String, required: true, trim: true },
    author: { type: String, trim: true, maxlength: 300 },
    license: { type: String, required: true, trim: true },
    licenseUrl: { type: String, trim: true },
    sourceUrl: { type: String, required: true, trim: true },
  },
  { _id: false },
)

const serviceSchema = new Schema<IService>(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    description: { type: String, trim: true, maxlength: 500 },
    pricing: {
      type: { type: String, enum: PRICING_TYPES, required: true },
      currency: { type: String, enum: CURRENCIES, default: 'PKR' },
      amount: { type: Number, min: 0 },
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      unit: { type: String, enum: PRICE_UNITS, default: 'project' },
    },
    deliveryDays: { type: Number, min: 1, max: 365 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

const availabilitySchema = new Schema<IAvailability>(
  {
    isOpen: { type: Boolean, default: false },
    openTo: [{ type: String, enum: OPEN_TO }],
    responseTime: { type: String, enum: RESPONSE_TIMES },
    availableFrom: { type: Date },
    note: { type: String, trim: true, maxlength: 280 },
    updatedAt: { type: Date },
  },
  { _id: false },
)

const personSchema = new Schema<IPerson>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    headline: { type: String, trim: true, maxlength: 160 },
    bio: { type: String, trim: true, maxlength: 3000 },
    photoUrl: { type: String, trim: true },
    photoCredit: { type: photoCreditSchema, default: undefined },
    roles: { type: [String], default: ['talent'] },
    services: { type: [serviceSchema], default: [] },
    availability: { type: availabilitySchema, default: undefined },
    status: { type: String, enum: PROFILE_STATUSES, default: 'public' },
    professions: [{ type: Schema.Types.ObjectId, ref: 'Profession' }],
    industries: [{ type: Schema.Types.ObjectId, ref: 'Industry' }],
    topics: [{ type: Schema.Types.ObjectId, ref: 'Topic' }],
    languages: [{ type: String, enum: LANGUAGE_CODES }],
    country: { type: String, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
    city: { type: String, trim: true },
    websiteUrl: { type: String, trim: true },
    socialAccounts: { type: [socialAccountSchema], default: [] },
    totalFollowers: { type: Number, default: 0 },
    claimedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    representedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    verified: { type: Boolean, default: false },
    visibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
    sourceRecords: { type: [sourceRecordSchema], default: [] },
    isDemo: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
    publicSnapshot: { type: Schema.Types.Mixed, default: undefined, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        delete ret.publicSnapshot
        return ret
      },
    },
  },
)

// Search filters ke liye indexes
personSchema.index({ visibility: 1, totalFollowers: -1 })
personSchema.index({ professions: 1 })
personSchema.index({ industries: 1 })
personSchema.index({ topics: 1 })
personSchema.index({ country: 1, city: 1 })
personSchema.index({ 'availability.isOpen': 1, 'availability.openTo': 1 })
// Roz ka cron: jin accounts ko sab se der se dekha, woh pehle
personSchema.index({ 'socialAccounts.followersCheckedAt': 1 })

// Save se pehle followers ka jor dobara nikalo
personSchema.pre('save', function () {
  this.totalFollowers = this.socialAccounts.reduce(
    (sum, account) => sum + (account.followers ?? 0),
    0,
  )
})

export const Person = model<IPerson>('Person', personSchema)

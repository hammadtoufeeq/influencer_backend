import type { Request, RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit, type Options, type Store } from 'express-rate-limit'
import { RateLimitHit } from '../models/RateLimitHit'
import { sendError } from '../utils/apiResponse'
import '../types/express'

// MongoDB wala store: ek atomic update se ginti barhao, window guzar gayi ho to 1 se shuru
class MongoStore implements Store {
  localKeys = false
  prefix: string
  windowMs = 60_000

  constructor(prefix: string) {
    this.prefix = prefix
  }

  init(options: Options) {
    this.windowMs = options.windowMs
  }

  async increment(key: string) {
    const now = new Date()
    const fresh = new Date(now.getTime() + this.windowMs)
    const active = { $gt: ['$resetAt', now] }
    const update = [
      {
        $set: {
          hits: { $cond: [active, { $add: ['$hits', 1] }, 1] },
          resetAt: { $cond: [active, '$resetAt', fresh] },
        },
      },
    ]
    const run = () =>
      RateLimitHit.findOneAndUpdate({ key: this.prefix + key }, update, {
        upsert: true,
        returnDocument: 'after',
        updatePipeline: true,
      }).lean()
    // Do requests ek saath pehli dafa aayen to ek ko duplicate key milti hai: dobara chalao
    const doc = await run().catch((error: { code?: number }) => {
      if (error.code === 11000) return run()
      throw error
    })
    return { totalHits: doc!.hits, resetTime: doc!.resetAt }
  }

  async decrement(key: string) {
    await RateLimitHit.updateOne({ key: this.prefix + key }, { $inc: { hits: -1 } })
  }

  async resetKey(key: string) {
    await RateLimitHit.deleteOne({ key: this.prefix + key })
  }
}

// Asli client IP. Vercel ye header khud lagata hai (client isay badal nahi sakta)
export function clientIp(req: Request) {
  const vercel = req.headers['x-vercel-forwarded-for']
  const ip = (Array.isArray(vercel) ? vercel[0] : vercel)?.split(',')[0]?.trim() || req.ip || ''
  return ipKeyGenerator(ip)
}

const emailOf = (req: Request) =>
  typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''

type By = 'ip' | 'ip+email' | 'user'

const KEYS: Record<By, (req: Request) => string> = {
  ip: clientIp,
  // Login / reset: ek IP se ek account pe. Shared IP (office, mobile network) ke baqi log nahi rukte
  'ip+email': (req) => `${clientIp(req)}|${emailOf(req)}`,
  // Login ke baad: user ke hisaab se (OTP codes)
  user: (req) => req.user?.id ?? clientIp(req),
}

function limiter(
  name: string,
  { windowMinutes, max, by, failuresOnly = false }: {
    windowMinutes: number
    max: number
    by: By
    failuresOnly?: boolean
  },
) {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit: max,
    keyGenerator: KEYS[by],
    // Sirf nakam koshishein ginti mein (sahi login / code pe ginti nahi barhti)
    skipSuccessfulRequests: failuresOnly,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new MongoStore(`${name}:`),
    // Tests mein band (RATE_LIMIT=off); rate limit wala test isay khud on karta hai
    skip: () => process.env.RATE_LIMIT === 'off',
    // IP hum khud nikalte hain (clientIp); DB na mile to request rok kar error nahi, aage jane do
    validate: { trustProxy: false, xForwardedForHeader: false },
    passOnStoreError: true,
    handler: (_req, res, _next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 60_000)
      sendError(
        res,
        429,
        'TOO_MANY_REQUESTS',
        `Too many attempts. Please try again in ${retryAfter} minute(s)`,
        undefined,
        { retryAfterMinutes: retryAfter },
      )
    },
  })
}

// Login: ek IP + email pe 15 minute mein 10 ghalat koshishein
export const loginLimiter = limiter('login', { windowMinutes: 15, max: 10, by: 'ip+email', failuresOnly: true })
// Naye accounts: ek IP se ghante mein 10
export const registerLimiter = limiter('register', { windowMinutes: 60, max: 10, by: 'ip' })
// Password reset (code bhejna, code daalna, naya password): IP + email pe 15 minute mein 10
export const passwordResetLimiter = limiter('reset', { windowMinutes: 15, max: 10, by: 'ip+email' })
// Claim / business / muahide ke OTP codes: har user 15 minute mein 20 ghalat koshishein
export const otpLimiter = limiter('otp', { windowMinutes: 15, max: 20, by: 'user', failuresOnly: true })
// Public report form: ek IP se ghante mein 10
export const reportLimiter = limiter('report', { windowMinutes: 60, max: 10, by: 'ip' })
// Talent ke baare mein sawal: ek IP se ghante mein 5
export const inquiryLimiter = limiter('inquiry', { windowMinutes: 60, max: 5, by: 'ip' })
// Saari likhne wali requests (POST / PATCH / PUT / DELETE): har user (ya IP) minute mein 120.
// GET pe nahi: woh CDN se aati hain aur har GET pe DB ka ek aur chakkar faltu hai
const writes = limiter('write', { windowMinutes: 1, max: 120, by: 'user' })
export const writeLimiter: RequestHandler = (req, res, next) =>
  req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
    ? next()
    : writes(req, res, next)

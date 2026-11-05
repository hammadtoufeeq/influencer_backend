import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { Person } from '../models/Person'
import { User } from '../models/User'
import { notifyAdmins, notifyUser } from '../services/notificationService'
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  NEEDS_ACTION_CLAIM_STATUSES,
  OPEN_CLAIM_STATUSES,
  ProfileClaim,
  type ClaimStatus,
} from '../models/ProfileClaim'
import { writeAuditLog } from '../services/auditService'
import {
  generateUniquePersonSlug,
  resolveTaxonomySlugs,
  setPersonOwner,
} from '../services/personService'
import { Industry, Profession, Topic } from '../models/taxonomy'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { generateClaimCode, hashClaimCode, isClaimCodeValid } from '../utils/claimCode'
import { parseOrThrow } from '../utils/validation'
import { slugify } from '../utils/slugify'
import {
  adminListClaimsQuerySchema,
  newProfileClaimSchema,
  resetOtpSchema,
  reviewClaimSchema,
  sendCodeSchema,
  verifyCodeSchema,
  type CreateClaimInput,
} from '../validators/claimValidator'
import { mergeSocialAccounts } from '../services/followerService'

const PERSON_FIELDS = 'name slug headline photoUrl claimedBy'
const CLAIM_POPULATE = [
  { path: 'person', select: PERSON_FIELDS },
  { path: 'user', select: 'name email role' },
  { path: 'verifiedBy', select: 'name email' },
]

type ClaimDoc = Awaited<ReturnType<typeof findClaimOr404>>

async function findClaimOr404(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  const claim = await ProfileClaim.findById(id).select('+verification.codeHash')
  if (!claim) throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  return claim
}

// POST /api/claims -> talent kehta hai "ye profile meri hai"
export async function createClaim(req: Request, res: Response) {
  const input = req.body as CreateClaimInput
  const userId = req.user!.id

  const person = await Person.findOne({ _id: input.personId, visibility: 'visible' })
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  if (person.claimedBy) {
    throw new AppError(409, 'ALREADY_CLAIMED', 'This profile has already been claimed')
  }

  // Ek talent ki ek hi profile ho sakti hai
  if (await Person.exists({ claimedBy: userId })) {
    throw new AppError(409, 'ALREADY_OWNS_PROFILE', 'You already own a profile')
  }
  // Ek waqt mein ek hi khula claim
  if (await ProfileClaim.exists({ user: userId, status: { $in: OPEN_CLAIM_STATUSES } })) {
    throw new AppError(409, 'CLAIM_PENDING', 'You already have a claim waiting for review')
  }

  const claim = await ProfileClaim.create({
    person: person._id,
    user: userId,
    evidence: {
      contactEmail: await accountEmailOf(userId),
      links: input.links,
      note: input.note || undefined,
    },
  })

  await notifyAdmins({
    type: 'claim.new',
    data: { person: person.name, claimant: await nameOf(userId) },
    link: claimLink(claim),
  })

  await claim.populate({ path: 'person', select: PERSON_FIELDS })
  sendSuccess(res, { claim }, 201)
}

// Link ko compare ke liye ek shakal mein: chhote huroof, bina https/www aur aakhri "/"
function normalizeUrl(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

// POST /api/claims/new-profile -> talent ko apni profile na mile to khud bheje.
// Profile chhupi (draft) banti hai, saath claim; wahi OTP flow, approve pe public
export async function createNewProfileClaim(req: Request, res: Response) {
  const input = parseOrThrow(newProfileClaimSchema, req.body ?? {})
  const userId = req.user!.id

  if (await Person.exists({ claimedBy: userId })) {
    throw new AppError(409, 'ALREADY_OWNS_PROFILE', 'You already own a profile')
  }
  if (await ProfileClaim.exists({ user: userId, status: { $in: OPEN_CLAIM_STATUSES } })) {
    throw new AppError(409, 'CLAIM_PENDING', 'You already have a claim waiting for review')
  }

  // Pehle se milti julti public profile? (wahi naam ya wahi social link) Talent ko dikhao
  if (!input.force) {
    const base = slugify(input.name)
    const linkPatterns = input.socialAccounts.map(
      (a) => new RegExp(`^https?://(www\\.)?${escapeRegex(normalizeUrl(a.url))}/?$`, 'i'),
    )
    const candidates = await Person.find({
      visibility: 'visible',
      $or: [
        { name: new RegExp(`^${escapeRegex(input.name.trim())}$`, 'i') },
        ...(base ? [{ slug: new RegExp(`^${escapeRegex(base)}(-\\d+)?$`) }] : []),
        { 'socialAccounts.url': { $in: linkPatterns } },
      ],
    })
      .select('name slug headline photoUrl claimedBy')
      .limit(5)
    if (candidates.length > 0) {
      const matches = candidates.map((p) => ({
        _id: p._id,
        name: p.name,
        slug: p.slug,
        headline: p.headline,
        photoUrl: p.photoUrl,
        claimed: Boolean(p.claimedBy),
      }))
      throw new AppError(
        409,
        'POSSIBLE_DUPLICATE',
        'A profile like this already exists',
        undefined,
        { matches },
      )
    }
  }

  const [professions, industries, topics, slug] = await Promise.all([
    resolveTaxonomySlugs(Profession, input.professions ?? [], 'professions'),
    resolveTaxonomySlugs(Industry, input.industries ?? [], 'industries'),
    resolveTaxonomySlugs(Topic, input.topics ?? [], 'topics'),
    generateUniquePersonSlug(input.name),
  ])

  // contactEmail form se nahi: account wali email lagti hai
  const { contactEmail: _contactEmail, note, force: _force, ...profile } = input
  const person = await Person.create({
    ...profile,
    socialAccounts: mergeSocialAccounts([], profile.socialAccounts),
    slug,
    professions,
    industries,
    topics,
    visibility: 'hidden',
    isDraft: true,
    sourceRecords: [{ sourceType: 'self_submitted', note: 'Submitted by the person' }],
  })

  try {
    const claim = await ProfileClaim.create({
      person: person._id,
      user: userId,
      isNewProfile: true,
      requestedName: person.name,
      evidence: {
        contactEmail: await accountEmailOf(userId),
        links: [...new Set(input.socialAccounts.map((a) => a.url))].slice(0, 5),
        note: note || undefined,
      },
    })
    await writeAuditLog(req, {
      action: 'claim.new_profile',
      targetType: 'claim',
      targetId: claim._id,
      targetLabel: person.name,
      after: { status: claim.status, isNewProfile: true, name: person.name },
    })
    await notifyAdmins({
      type: 'claim.new_profile',
      data: { person: person.name, claimant: await nameOf(userId) },
      link: claimLink(claim),
    })
    await claim.populate({ path: 'person', select: PERSON_FIELDS })
    sendSuccess(res, { claim }, 201)
  } catch (error) {
    // Claim na ban saka to akela draft na chhoro
    await Person.deleteOne({ _id: person._id })
    throw error
  }
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GET /api/claims/mine -> mere claims (naye pehle)
export async function listMyClaims(req: Request, res: Response) {
  const claims = await ProfileClaim.find({ user: req.user!.id })
    .populate({ path: 'person', select: PERSON_FIELDS })
    .sort({ createdAt: -1 })
    .limit(20)
  sendSuccess(res, { claims })
}

// GET /api/claims/my-profile -> jo profile mere naam hai (ya null)
export async function getMyProfile(req: Request, res: Response) {
  const person = await Person.findOne({ claimedBy: req.user!.id }).populate([
    { path: 'professions', select: 'name slug' },
    { path: 'industries', select: 'name slug' },
    { path: 'topics', select: 'name slug' },
  ])
  sendSuccess(res, { person })
}

// POST /api/claims/:id/verify -> talent woh code (OTP) daalta hai jo admin ne DM kiya
export async function verifyClaimCode(req: Request, res: Response) {
  const { code } = parseOrThrow(verifyCodeSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  // Sirf apna claim
  if (claim.user.toString() !== req.user!.id) {
    throw new AppError(404, 'NOT_FOUND', 'Claim not found')
  }
  if (claim.status === 'otp_failed') {
    throw otpLockedError()
  }
  if (claim.status !== 'waiting_for_talent' || !claim.verification.codeHash) {
    throw new AppError(409, 'NO_ACTIVE_CODE', 'There is no code to verify for this claim')
  }
  if (claim.verification.expiresAt && claim.verification.expiresAt < new Date()) {
    throw new AppError(410, 'CODE_EXPIRED', 'This code has expired. We will send you a new one.')
  }

  const now = new Date()
  if (!isClaimCodeValid(code, claim.id, claim.verification.codeHash)) {
    const before = { status: claim.status, otpAttempts: claim.otpAttempts ?? 0 }
    claim.otpAttempts = (claim.otpAttempts ?? 0) + 1
    claim.lastOtpAttemptAt = now
    const left = Math.max(MAX_CODE_ATTEMPTS - claim.otpAttempts, 0)

    if (left === 0) {
      // 5vi ghalat koshish: claim lock, ab koi OTP qabool nahi. Admin dekhega
      claim.status = 'otp_failed'
      claim.otpLockedAt = now
      claim.verification.codeHash = undefined
      await claim.save()
      await writeAuditLog(req, {
        action: 'claim.otp_locked',
        targetType: 'claim',
        targetId: claim._id,
        targetLabel: await personName(claim),
        before,
        after: {
          status: claim.status,
          otpAttempts: claim.otpAttempts,
          otpLockedAt: claim.otpLockedAt,
        },
      })
      await notifyAdmins({
        type: 'claim.otp_locked',
        data: { person: await personName(claim), claimant: await nameOf(claim.user) },
        link: claimLink(claim),
      })
      throw otpLockedError()
    }

    await claim.save()
    throw new AppError(
      400,
      'INVALID_CODE',
      'That code is not correct',
      { code: `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` },
      { attemptsLeft: left, maxAttempts: MAX_CODE_ATTEMPTS },
    )
  }

  // Sahi code: tasdeeq ho gayi, ab admin final approve karega
  claim.set({
    status: 'verified',
    verificationMethod: 'otp',
    verifiedAt: now,
    verifiedBy: null,
    otpAttempts: 0,
  })
  claim.verification.codeHash = undefined
  await claim.save()

  await notifyAdmins({
    type: 'claim.code_verified',
    data: { person: await personName(claim), claimant: await nameOf(claim.user) },
    link: claimLink(claim),
  })

  await claim.populate({ path: 'person', select: PERSON_FIELDS })
  sendSuccess(res, { claim })
}

// Notification ke jumle ke liye naam
// Claim ke saath hamesha wohi email jis se talent login hai (form se nahi badal sakti)
async function accountEmailOf(userId: unknown) {
  const user = await User.findById(userId).select('email')
  return user?.email
}

async function nameOf(userId: unknown) {
  const user = await User.findById(userId).select('name')
  return user?.name
}

// Claim ka admin page
const claimLink = (claim: { _id: unknown }) => `/admin/claims/${String(claim._id)}`

function otpLockedError() {
  return new AppError(
    423,
    'OTP_LOCKED',
    'Too many wrong attempts. Your claim is under review by the admin.',
    undefined,
    { attemptsLeft: 0, maxAttempts: MAX_CODE_ATTEMPTS },
  )
}

async function personName(claim: ClaimDoc) {
  const person = await Person.findById(claim.person).select('name')
  return person?.name
}

// GET /api/admin/claims?status=open -> admin ke liye list
export async function adminListClaims(req: Request, res: Response) {
  const query = parseOrThrow(adminListClaimsQuerySchema, req.query)
  // 'all' = koi filter nahi: verified / approved claims bhi list mein rehte hain
  const statuses: ClaimStatus[] | null =
    query.status === 'all'
      ? null
      : query.status === 'open' || query.status === 'new_profiles'
        ? OPEN_CLAIM_STATUSES
        : query.status === 'needs_action'
          ? NEEDS_ACTION_CLAIM_STATUSES
          : [query.status]
  const filter = {
    ...(statuses && { status: { $in: statuses } }),
    ...(query.status === 'new_profiles' && { isNewProfile: true }),
  }
  const isOpen = statuses !== null && statuses.every((s) => OPEN_CLAIM_STATUSES.includes(s))
  const skip = (query.page - 1) * query.limit

  const [claims, total] = await Promise.all([
    ProfileClaim.find(filter)
      .populate(CLAIM_POPULATE)
      // Khule claims purane pehle (pehle aao pehle pao), band claims naye pehle
      .sort({ createdAt: isOpen ? 1 : -1 })
      .skip(skip)
      .limit(query.limit),
    ProfileClaim.countDocuments(filter),
  ])

  sendSuccess(res, { claims }, 200, { page: query.page, limit: query.limit, total })
}

// Naya code banao: purana code bekaar, koshishein 0, lock khatam, status waiting_for_talent
function issueCode(claim: ClaimDoc, channelUrl: string) {
  // Code sirf talent ke diye hue links mein se kisi pe ja sakta hai
  if (!claim.evidence.links.includes(channelUrl)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', {
      channelUrl: 'Choose one of the links the talent provided',
    })
  }
  const code = generateClaimCode()
  const now = new Date()
  claim.set({
    status: 'waiting_for_talent',
    otpAttempts: 0,
    otpLockedAt: undefined,
    lastOtpAttemptAt: undefined,
  })
  claim.verification = {
    channelUrl,
    codeHash: hashClaimCode(code, claim.id),
    codeSentAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  }
  return code
}

// POST /api/admin/claims/:id/code -> naya code banao. Admin isse khud DM karega
export async function adminSendClaimCode(req: Request, res: Response) {
  const { channelUrl } = parseOrThrow(sendCodeSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  if (!['pending', 'waiting_for_talent'].includes(claim.status)) {
    throw new AppError(409, 'INVALID_STATE', `A code cannot be sent for a ${claim.status} claim`)
  }
  const code = issueCode(claim, channelUrl)
  await claim.save()
  await notifyCodeSent(claim)
  await claim.populate(CLAIM_POPULATE)

  // Code sirf isi jawab mein ek dafa wapas aata hai, phir kabhi nahi
  sendSuccess(res, { claim, code })
}

// POST /api/admin/claims/:id/reset-otp -> lock khol kar naya code (otp_failed / waiting_for_talent)
export async function adminResetClaimOtp(req: Request, res: Response) {
  const input = parseOrThrow(resetOtpSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  if (!['waiting_for_talent', 'otp_failed'].includes(claim.status)) {
    throw new AppError(409, 'INVALID_STATE', `The code cannot be reset for a ${claim.status} claim`)
  }
  // Link na diya ho to wahi jahan pichla code gaya tha
  const channelUrl = input.channelUrl ?? claim.verification.channelUrl ?? claim.evidence.links[0]
  const code = issueCode(claim, channelUrl)
  await claim.save()
  await notifyCodeSent(claim)
  await claim.populate(CLAIM_POPULATE)
  sendSuccess(res, { claim, code })
}

// Talent ko: code us ke official account pe bhej diya gaya
async function notifyCodeSent(claim: ClaimDoc) {
  await notifyUser(claim.user, {
    type: 'claim.code_sent',
    data: { person: await personName(claim), channel: claim.verification.channelUrl },
    link: '/dashboard',
  })
}

// Final manzoori: person ka maalik set karo aur isi profile ke baqi khule claims reject
async function approveClaim(claim: ClaimDoc, reviewedBy: string) {
  const reviewedAt = new Date()
  // Person ka maalik "people" service ke zariye set hota hai (document ka rule)
  await setPersonOwner(claim.person, claim.user)
  // Talent ki khud bheji hui profile ab public
  if (claim.isNewProfile) {
    await Person.updateOne(
      { _id: claim.person, isDraft: true },
      { $set: { visibility: 'visible', isDraft: false } },
    )
  }
  claim.set({ status: 'approved', reviewedBy, reviewedAt })
  claim.verification.codeHash = undefined
  await claim.save()

  const person = await personName(claim)
  await notifyUser(claim.user, { type: 'claim.approved', data: { person }, link: '/dashboard' })

  // Isi profile ke baqi khule claims khud reject: un talents ko bhi batao
  const others = await ProfileClaim.find({
    person: claim.person,
    status: { $in: OPEN_CLAIM_STATUSES },
    _id: { $ne: claim._id },
  }).select('user')
  await Promise.all(
    others.map((other) =>
      notifyUser(other.user, { type: 'claim.rejected', data: { person }, link: '/dashboard' }),
    ),
  )

  await ProfileClaim.updateMany(
    { person: claim.person, status: { $in: OPEN_CLAIM_STATUSES }, _id: { $ne: claim._id } },
    {
      $set: {
        status: 'rejected',
        reviewedBy,
        reviewedAt,
        rejectionReason: 'Another claim for this profile was approved',
      },
      $unset: { 'verification.codeHash': 1 },
    },
  )
}

// POST /api/admin/claims/:id/verify-manual -> admin khud tasdeeq kare (OTP ke baghair)
// aur foran approve: waiting_for_talent ya otp_failed se
export async function adminVerifyClaimManually(req: Request, res: Response) {
  const claim = await findClaimOr404(String(req.params.id))

  if (!['waiting_for_talent', 'otp_failed'].includes(claim.status)) {
    throw new AppError(409, 'INVALID_STATE', `A ${claim.status} claim cannot be verified manually`)
  }

  claim.set({
    status: 'verified',
    verificationMethod: 'admin_manual',
    verifiedBy: req.user!.id,
    verifiedAt: new Date(),
  })
  await approveClaim(claim, req.user!.id)

  await claim.populate(CLAIM_POPULATE)
  sendSuccess(res, { claim })
}

// PATCH /api/admin/claims/:id -> approve (verified ke baad) ya reject
export async function adminReviewClaim(req: Request, res: Response) {
  const { action, reason } = parseOrThrow(reviewClaimSchema, req.body ?? {})
  const claim = await findClaimOr404(String(req.params.id))

  if (!OPEN_CLAIM_STATUSES.includes(claim.status)) {
    throw new AppError(409, 'ALREADY_REVIEWED', `This claim was already ${claim.status}`)
  }

  const reviewedBy = req.user!.id
  const reviewedAt = new Date()

  if (action === 'approve') {
    if (claim.status !== 'verified') {
      throw new AppError(409, 'CODE_NOT_VERIFIED', 'The talent has not entered the correct code yet')
    }
    await approveClaim(claim, reviewedBy)
  } else {
    claim.set({
      status: 'rejected',
      reviewedBy,
      reviewedAt,
      rejectionReason: reason || 'We could not verify that this profile belongs to you',
    })
    claim.verification.codeHash = undefined
    await claim.save()
    await notifyUser(claim.user, {
      type: 'claim.rejected',
      data: {
        person: (await personName(claim)) ?? claim.requestedName,
        reason: claim.rejectionReason,
      },
      link: '/dashboard',
    })
    // Reject hui nayi profile ka chhupa draft mita do (sirf agar abhi bhi draft aur kisi ka nahi)
    if (claim.isNewProfile) {
      await Person.deleteOne({ _id: claim.person, isDraft: true, claimedBy: null })
    }
  }

  await claim.populate(CLAIM_POPULATE)
  sendSuccess(res, { claim })
}

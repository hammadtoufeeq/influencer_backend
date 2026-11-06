import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { Person } from '../models/Person'
import { OPEN_CLAIM_STATUSES, ProfileClaim } from '../models/ProfileClaim'
import { User } from '../models/User'
import { readImage, removeImage, saveImage } from '../services/imageStorage'
import { canManageProfile } from '../services/representationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'

// GET /api/uploads/:file -> upload ki hui tasveer (public; naam badalta hai, is liye hamesha cache)
export async function getUpload(req: Request, res: Response) {
  const image = await readImage(String(req.params.file))
  if (!image) throw new AppError(404, 'NOT_FOUND', 'Image not found')
  res.set('Content-Type', image.contentType)
  res.set('Cache-Control', 'public, max-age=31536000, immutable')
  res.set('CDN-Cache-Control', 'max-age=31536000')
  res.send(image.data)
}

// PUT /api/account/avatar -> har account (admin, talent, manager, business) apni photo / logo
export async function uploadAvatar(req: Request, res: Response) {
  const user = await User.findById(req.user!.id)
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')
  const url = await saveImage(req.file!.buffer, req.imageType!, user.id)
  const old = user.avatarUrl
  user.avatarUrl = url
  await user.save()
  await removeImage(old)
  sendSuccess(res, { user })
}

// DELETE /api/account/avatar -> photo hatao (initials wapas)
export async function removeAvatar(req: Request, res: Response) {
  const user = await User.findById(req.user!.id)
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in')
  const old = user.avatarUrl
  user.avatarUrl = undefined
  await user.save()
  await removeImage(old)
  sendSuccess(res, { user })
}

// Profile ki photo kaun badal sakta hai: maalik talent, us ka manager ("manageProfile"),
// admin (sirf unclaimed profile; claimed profile maalik ki hai), ya woh talent jis ne yeh
// nayi profile khud bheji aur us ka claim abhi chal raha hai (draft, approve se pehle)
async function editablePerson(req: Request) {
  const id = String(req.params.id)
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  const person = await Person.findById(id)
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')
  const user = req.user!
  const isOwner =
    person.claimedBy?.toString() === user.id ||
    (user.role === 'representative' && (await canManageProfile(user.id, id)))
  const isAdmin = user.role === 'admin' && !person.claimedBy
  const isSubmitter =
    !isOwner &&
    person.isDraft &&
    !person.claimedBy &&
    Boolean(
      await ProfileClaim.exists({
        person: person._id,
        user: user.id,
        isNewProfile: true,
        status: { $in: OPEN_CLAIM_STATUSES },
      }),
    )
  if (!isOwner && !isAdmin && !isSubmitter) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change the photo of your own profile')
  }
  return person
}

// PUT /api/people/:id/photo -> talent ki public profile photo
export async function uploadPersonPhoto(req: Request, res: Response) {
  const person = await editablePerson(req)
  const url = await saveImage(req.file!.buffer, req.imageType!, req.user!.id)
  const old = person.photoUrl
  // Apni photo: bahar ki tasveer ka credit ab lagu nahi
  person.set({ photoUrl: url, photoCredit: undefined })
  await person.save()
  await removeImage(old)
  sendSuccess(res, { photoUrl: url })
}

// DELETE /api/people/:id/photo
export async function removePersonPhoto(req: Request, res: Response) {
  const person = await editablePerson(req)
  const old = person.photoUrl
  person.set({ photoUrl: undefined, photoCredit: undefined })
  await person.save()
  await removeImage(old)
  sendSuccess(res, { photoUrl: null })
}

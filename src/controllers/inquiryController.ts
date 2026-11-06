import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import '../types/express'
import { AuditLog } from '../models/AuditLog'
import { Inquiry } from '../models/Inquiry'
import { Person } from '../models/Person'
import { writeAuditLog } from '../services/auditService'
import { notifyAdmins } from '../services/notificationService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'
import { parseOrThrow } from '../utils/validation'
import {
  listInquiriesQuerySchema,
  updateInquirySchema,
  type CreateInquiryInput,
} from '../validators/inquiryValidator'

const INQUIRY_POPULATE = [
  { path: 'person', select: 'name slug headline photoUrl visibility claimedBy' },
  { path: 'user', select: 'name email role' },
  { path: 'handledBy', select: 'name email' },
]

// POST /api/inquiries -> koi bhi (login ke baghair bhi) kisi talent ke baare mein sawal bheje.
// Admin ke paas jata hai; jawab email pe
export async function createInquiry(req: Request, res: Response) {
  const input = req.body as CreateInquiryInput
  const person = await Person.findOne({ _id: input.personId, visibility: 'visible' }).select('name')
  if (!person) throw new AppError(404, 'NOT_FOUND', 'Profile not found')

  // Bot ne chhupa khana bhar diya: kamyabi jaisa jawab, save kuch nahi
  if (input.website) {
    sendSuccess(res, { inquiry: { status: 'new' } }, 201)
    return
  }

  const inquiry = await Inquiry.create({
    person: person._id,
    name: input.name,
    email: input.email,
    phone: input.phone || undefined,
    message: input.message,
    user: req.user?.id,
  })

  await notifyAdmins({
    type: 'inquiry.new',
    data: { person: person.name, name: input.name },
    link: `/admin/inquiries/${String(inquiry._id)}`,
  })

  sendSuccess(res, { inquiry: { _id: inquiry._id, status: inquiry.status } }, 201)
}

async function findInquiry(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Query not found')
  const inquiry = await Inquiry.findById(id).populate(INQUIRY_POPULATE)
  if (!inquiry) throw new AppError(404, 'NOT_FOUND', 'Query not found')
  return inquiry
}

// GET /api/admin/inquiries -> naye sawal pehle (purane se naye), baqi naye se purane
export async function adminListInquiries(req: Request, res: Response) {
  const query = parseOrThrow(listInquiriesQuerySchema, req.query)
  const filter: Record<string, unknown> = {}
  if (query.status) filter.status = query.status

  const isQueue = !query.status || query.status === 'new' || query.status === 'in_progress'
  const skip = (query.page - 1) * query.limit
  const [inquiries, total] = await Promise.all([
    Inquiry.find(filter)
      .populate(INQUIRY_POPULATE)
      .sort({ createdAt: isQueue ? 1 : -1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    Inquiry.countDocuments(filter),
  ])
  sendSuccess(res, { inquiries }, 200, { page: query.page, limit: query.limit, total })
}

// GET /api/admin/inquiries/:id -> detail + history
export async function adminGetInquiry(req: Request, res: Response) {
  const inquiry = await findInquiry(String(req.params.id))
  const history = await AuditLog.find({ targetType: 'inquiry', targetId: inquiry._id })
    .sort({ createdAt: -1 })
    .limit(50)
  sendSuccess(res, { inquiry, history })
}

// PATCH /api/admin/inquiries/:id -> status + admin ka note
export async function adminUpdateInquiry(req: Request, res: Response) {
  const input = parseOrThrow(updateInquirySchema, req.body ?? {})
  const inquiry = await findInquiry(String(req.params.id))
  const before = { status: inquiry.status, adminNote: inquiry.adminNote }

  inquiry.status = input.status
  if (input.adminNote !== undefined) inquiry.adminNote = input.adminNote
  inquiry.handledBy = req.user!.id as never
  inquiry.handledAt = new Date()
  await inquiry.save()

  const person = inquiry.person as unknown as { name?: string } | null
  await writeAuditLog(req, {
    action: 'inquiry.update',
    targetType: 'inquiry',
    targetId: inquiry._id,
    targetLabel: person?.name,
    before,
    after: { status: inquiry.status, adminNote: inquiry.adminNote },
  })

  await inquiry.populate(INQUIRY_POPULATE)
  sendSuccess(res, { inquiry })
}

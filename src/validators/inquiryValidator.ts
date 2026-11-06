import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { INQUIRY_STATUSES } from '../models/Inquiry'

const page = z.coerce.number().int().min(1).default(1)
const limit = z.coerce.number().int().min(1).max(50).default(20)

export const createInquirySchema = z.object({
  personId: z.string().refine(isValidObjectId, 'Invalid profile'),
  name: z.string().trim().min(2, 'Enter your name').max(100),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  phone: z
    .union([
      z
        .string()
        .trim()
        .regex(/^\+?[\d\s()-]{7,20}$/, 'Enter a valid phone number'),
      z.literal(''),
    ])
    .optional(),
  message: z
    .string()
    .trim()
    .min(10, 'Please write your question (at least 10 characters)')
    .max(2000),
  // Spam bots ke liye chhupa khana: insaan ise khali chhorta hai
  website: z.string().max(200).optional(),
})

export const listInquiriesQuerySchema = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  page,
  limit,
})

export const updateInquirySchema = z.object({
  // Sawal wapas "new" nahi hota
  status: z.enum(['in_progress', 'answered', 'closed']),
  adminNote: z.string().trim().max(1000).optional(),
})

export type CreateInquiryInput = z.infer<typeof createInquirySchema>

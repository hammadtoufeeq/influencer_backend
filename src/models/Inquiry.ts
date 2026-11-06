import { Schema, model, type Types } from 'mongoose'

// Kisi talent ke baare mein sawal (guest bhi bhej sakta hai). Seedha admin ke paas jata hai,
// talent ko nahi; admin email pe jawab deta hai
export const INQUIRY_STATUSES = ['new', 'in_progress', 'answered', 'closed'] as const
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]

export interface IInquiry {
  person: Types.ObjectId
  name: string
  email: string
  phone?: string
  message: string
  // Login user ho to us ka account bhi
  user?: Types.ObjectId
  status: InquiryStatus
  adminNote?: string
  handledBy?: Types.ObjectId
  handledAt?: Date
  createdAt: Date
  updatedAt: Date
}

const inquirySchema = new Schema<IInquiry>(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 30 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: INQUIRY_STATUSES, default: 'new' },
    adminNote: { type: String, trim: true, maxlength: 1000 },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'inquiries',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

inquirySchema.index({ status: 1, createdAt: 1 })
inquirySchema.index({ person: 1, createdAt: -1 })

export const Inquiry = model<IInquiry>('Inquiry', inquirySchema)

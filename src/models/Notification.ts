import { Schema, model, type Types } from 'mongoose'

// Kis cheez ki notification. Likhai frontend pe type + data se banti hai (teeno zabanon mein)
export const NOTIFICATION_TYPES = [
  // Admin ke liye
  'claim.new',
  'claim.new_profile',
  'claim.code_verified',
  'claim.otp_locked',
  'report.new',
  'inquiry.new',
  'business.new',
  'business.code_verified',
  'business.otp_locked',
  'agreement.disputed_admin',
  'manager.new',
  // Talent ke liye
  'claim.code_sent',
  'claim.approved',
  'claim.rejected',
  'hire.new',
  'hire.cancelled',
  'representation.requested',
  'hire.answered_by_manager',
  'campaign.accepted',
  'campaign.rejected',
  // Manager ke liye
  'manager.approved',
  'manager.rejected',
  'manager.reviewed',
  'representation.invited',
  'hire.new_managed',
  // Talent aur manager dono
  'representation.accepted',
  'representation.declined',
  'representation.ended',
  // Business ke liye
  'business.code_sent',
  'business.approved',
  'business.rejected',
  'hire.accepted',
  'hire.declined',
  'campaign.application',
  // Muahide ke dono taraf
  'agreement.proposed',
  'agreement.updated',
  'agreement.signed',
  'agreement.active',
  'agreement.cancelled',
  'agreement.delivered',
  'agreement.approved',
  'agreement.changes_requested',
  'agreement.completed',
  'agreement.disputed',
  'agreement.resolved',
  'agreement.reviewed',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface INotification {
  recipient: Types.ObjectId
  type: NotificationType
  // Jumle ke liye naam waghera: { person: 'Ali', claimant: 'Sara' }
  data: Record<string, string>
  // Click pe kahan jana hai, jaise /admin/claims/123
  link: string
  readAt: Date | null
  createdAt: Date
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    link: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // Khali data ({}) bhi save ho aur jawab mein aaye: frontend hamesha data.x parhta hai
    minimize: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

notificationSchema.index({ recipient: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, readAt: 1 })

export const Notification = model<INotification>('Notification', notificationSchema)

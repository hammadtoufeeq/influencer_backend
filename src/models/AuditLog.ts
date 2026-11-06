import { Schema, model, type Types } from 'mongoose'

export const AUDIT_TARGET_TYPES = ['person', 'claim', 'user', 'report', 'business', 'agreement', 'manager', 'inquiry'] as const
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]

// Har admin action ka record: kis ne, kya kiya, kis cheez pe, pehle/baad mein kya tha
export interface IAuditLog {
  actor: Types.ObjectId
  actorEmail: string
  action: string
  targetType: AuditTargetType
  targetId?: Types.ObjectId
  targetLabel?: string
  before?: unknown
  after?: unknown
  ip?: string
  createdAt: Date
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, enum: AUDIT_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId },
    targetLabel: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  {
    // Audit log kabhi badalta nahi, is liye sirf createdAt
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'audit_logs',
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v
        return ret
      },
    },
  },
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })
auditLogSchema.index({ actor: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema)

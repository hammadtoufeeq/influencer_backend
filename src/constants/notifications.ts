import type { NotificationType } from '../models/Notification'

// Notifications page ke tabs: har type kis category mein
export const NOTIFICATION_CATEGORIES = {
  hiring: ['hire.new', 'hire.cancelled', 'hire.accepted', 'hire.declined', 'hire.new_managed', 'hire.answered_by_manager'],
  campaigns: ['campaign.application', 'campaign.accepted', 'campaign.rejected'],
  agreements: [
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
  ],
  // Apni tasdeeq: talent ka claim, business, manager
  verification: [
    'claim.code_sent',
    'claim.approved',
    'claim.rejected',
    'business.code_sent',
    'business.approved',
    'business.rejected',
    'manager.approved',
    'manager.rejected',
  ],
  // Talent aur manager ka rishta
  manager: [
    'representation.requested',
    'representation.invited',
    'representation.accepted',
    'representation.declined',
    'representation.ended',
    'manager.reviewed',
  ],
  // Admin ke kaam
  admin: [
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
  ],
} as const satisfies Record<string, readonly NotificationType[]>

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES
export const CATEGORY_NAMES = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[]

export function categoryOf(type: string): NotificationCategory | undefined {
  return CATEGORY_NAMES.find((name) =>
    (NOTIFICATION_CATEGORIES[name] as readonly string[]).includes(type),
  )
}

import { Router } from 'express'
import { createInquiry } from '../controllers/inquiryController'
import { optionalAuth } from '../middlewares/optionalAuth'
import { inquiryLimiter } from '../middlewares/rateLimit'
import { validate } from '../middlewares/validate'
import { createInquirySchema } from '../validators/inquiryValidator'

const router = Router()

// Koi bhi (login ho ya na ho) talent ke baare mein sawal bhej sakta hai
router.post('/', inquiryLimiter, optionalAuth, validate(createInquirySchema), createInquiry)

export default router

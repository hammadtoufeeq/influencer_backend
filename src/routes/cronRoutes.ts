import { Router } from 'express'
import { runFollowersCron } from '../controllers/cronController'

const router = Router()

router.get('/followers', runFollowersCron)

export default router

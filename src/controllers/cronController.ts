import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../config/env'
import { refreshDueBatch } from '../services/followerService'
import { AppError } from '../utils/AppError'
import { sendSuccess } from '../utils/apiResponse'

// Vercel Cron "Authorization: Bearer <CRON_SECRET>" bhejta hai. Secret na laga ho to cron band
function assertCron(req: Request) {
  const expected = Buffer.from(`Bearer ${env.cronSecret}`)
  const given = Buffer.from(req.get('authorization') ?? '')
  if (!env.cronSecret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid cron secret')
  }
}

// GET /api/cron/followers -> roz ek dafa: jin accounts ki baari hai un ke followers
export async function runFollowersCron(req: Request, res: Response) {
  assertCron(req)
  const result = await refreshDueBatch()
  sendSuccess(res, result)
}

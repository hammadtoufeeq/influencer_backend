import { promises as fs } from 'fs'
import path from 'path'
import { Types } from 'mongoose'
import { UploadedImage } from '../models/UploadedImage'
import {
  cloudinaryConfigured,
  removeFromCloudinary,
  uploadToCloudinary,
} from './cloudinaryStorage'

// Tasveerein kahan jati hain: Cloudinary (keys lagi hon), warna disk (uploads/ folder) ya MongoDB.
// Routes / frontend har driver ke saath wahi rehte hain
export type UploadDriver = 'cloudinary' | 'disk' | 'mongo'

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const
export type ImageType = keyof typeof IMAGE_TYPES

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const UPLOAD_URL_PREFIX = '/api/uploads/'

// UPLOAD_DRIVER se chuno, warna: Cloudinary laga ho to wahi, Vercel pe MongoDB
// (file system read-only), baqi jagah disk
export function uploadDriver(): UploadDriver {
  const chosen = process.env.UPLOAD_DRIVER
  if (chosen === 'cloudinary' || chosen === 'disk' || chosen === 'mongo') return chosen
  if (cloudinaryConfigured()) return 'cloudinary'
  return process.env.VERCEL ? 'mongo' : 'disk'
}

export function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'))
}

// Asal file ki pehli bytes se qism (browser ka bataya hua content-type nahi maante)
export function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

// "/api/uploads/<24 hex>.<ext>" -> { id, ext }; hamari apni upload na ho to null
export function parseUploadUrl(url?: string | null) {
  const match = url?.match(/^\/api\/uploads\/([a-f0-9]{24})\.(jpg|png|webp)$/)
  return match ? { id: match[1], ext: match[2], file: `${match[1]}.${match[2]}` } : null
}

const contentTypeOf = (ext: string) =>
  (Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream') as ImageType

// Tasveer save karo, uska public URL wapas (Cloudinary pe https://res.cloudinary.com/...)
export async function saveImage(buffer: Buffer, type: ImageType, owner?: string) {
  if (uploadDriver() === 'cloudinary') return uploadToCloudinary(buffer)
  const id = new Types.ObjectId()
  const ext = IMAGE_TYPES[type]
  if (uploadDriver() === 'disk') {
    await fs.mkdir(uploadDir(), { recursive: true })
    await fs.writeFile(path.join(uploadDir(), `${id}.${ext}`), buffer)
  } else {
    await UploadedImage.create({ _id: id, owner, data: buffer, contentType: type, bytes: buffer.length })
  }
  return `${UPLOAD_URL_PREFIX}${id}.${ext}`
}

// Purani tasveer hatao (sirf hamari apni upload; bahar ka link ya seed photo nahi).
// Driver badalne ke baad bhi purani jagah wali tasveer sahi jagah se hat'ti hai
export async function removeImage(url?: string | null) {
  await removeFromCloudinary(url)
  const parsed = parseUploadUrl(url)
  if (!parsed) return
  await fs.rm(path.join(uploadDir(), parsed.file), { force: true }).catch(() => undefined)
  await UploadedImage.deleteOne({ _id: parsed.id })
}

// Serve karne ke liye: disk pe ho to wahan se, warna MongoDB se
export async function readImage(file: string) {
  const parsed = parseUploadUrl(`${UPLOAD_URL_PREFIX}${file}`)
  if (!parsed) return null
  const onDisk = await fs.readFile(path.join(uploadDir(), parsed.file)).catch(() => null)
  if (onDisk) return { data: onDisk, contentType: contentTypeOf(parsed.ext) }
  const stored = await UploadedImage.findById(parsed.id)
  return stored ? { data: stored.data, contentType: stored.contentType } : null
}

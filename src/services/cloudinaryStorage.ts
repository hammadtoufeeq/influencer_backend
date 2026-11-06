import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'

interface CloudinaryKeys {
  cloudName: string
  apiKey: string
  apiSecret: string
}

// CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) ya teeno alag variables
function keys(): CloudinaryKeys | null {
  if (env.cloudinaryUrl) {
    try {
      const url = new URL(env.cloudinaryUrl)
      const parsed = {
        cloudName: url.hostname,
        apiKey: decodeURIComponent(url.username),
        apiSecret: decodeURIComponent(url.password),
      }
      if (url.protocol === 'cloudinary:' && parsed.cloudName && parsed.apiKey && parsed.apiSecret) {
        return parsed
      }
    } catch {
      // Ghalat CLOUDINARY_URL: neeche wale alag variables dekho
    }
  }
  const { cloudinaryCloudName: cloudName, cloudinaryApiKey: apiKey } = env
  if (cloudName && apiKey && env.cloudinaryApiSecret) {
    return { cloudName, apiKey, apiSecret: env.cloudinaryApiSecret }
  }
  return null
}

export function cloudinaryConfigured() {
  return keys() !== null
}

let configuredFor = ''

function client() {
  const found = keys()
  if (!found) {
    throw new AppError(500, 'UPLOADS_NOT_CONFIGURED', 'Image uploads are not configured')
  }
  if (configuredFor !== found.cloudName) {
    cloudinary.config({
      cloud_name: found.cloudName,
      api_key: found.apiKey,
      api_secret: found.apiSecret,
      secure: true,
    })
    configuredFor = found.cloudName
  }
  return { cloudinary, cloudName: found.cloudName }
}

// Tasveer Cloudinary pe: hamare folder mein, naya naam, 1600px se bari ho to chhoti.
// Wapas link mein f_auto,q_auto: browser ko sab se halki shakal (webp / avif) milti hai
export async function uploadToCloudinary(buffer: Buffer) {
  const { cloudinary: api } = client()
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    api.uploader
      .upload_stream(
        {
          folder: env.cloudinaryFolder,
          resource_type: 'image',
          unique_filename: true,
          overwrite: false,
          transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
        },
        (error, response) => (error || !response ? reject(error) : resolve(response)),
      )
      .end(buffer)
  }).catch((error: unknown) => {
    console.error('Cloudinary upload failed', error)
    throw new AppError(502, 'UPLOAD_FAILED', 'Could not upload the image. Please try again')
  })
  return result.secure_url.replace('/image/upload/', '/image/upload/f_auto,q_auto/')
}

// Hamara Cloudinary link -> public_id ("<folder>/<naam>"). Kisi aur ka link ho to null
export function cloudinaryPublicId(url?: string | null) {
  if (!url) return null
  const found = keys()
  if (!found) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const base = `/${found.cloudName}/image/upload/`
  if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.startsWith(base)) return null
  const folderStart = parsed.pathname.indexOf(`/${env.cloudinaryFolder}/`, base.length - 1)
  if (folderStart === -1) return null
  return decodeURIComponent(parsed.pathname.slice(folderStart + 1).replace(/\.[a-z0-9]+$/i, ''))
}

// Purani tasveer Cloudinary se bhi hatao (na ho sake to sirf log; user ka kaam nahi rukta)
export async function removeFromCloudinary(url?: string | null) {
  const publicId = cloudinaryPublicId(url)
  if (!publicId) return
  try {
    await client().cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
  } catch (error) {
    console.error('Cloudinary delete failed', error)
  }
}

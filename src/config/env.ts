import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const clientUrls = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean)

// Saare environment variables sirf yahan se parhe jate hain
export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || '',
  // Emails ke links: pehla domain
  clientUrl: clientUrls[0],
  // CORS: ek ya kai frontend domain (comma se alag, jaise production + preview)
  clientUrls,
  platformName: process.env.PLATFORM_NAME || 'Influence Platform',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  // Email (password reset OTP). Gmail ho to App Password istemal karein
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || '',
  // "Sign in with Google": Google Cloud Console ka OAuth Web client ID (public hai, secret nahi)
  // (VITE_GOOGLE_CLIENT_ID bhi chalega: aksar wahi naam dono projects mein daal diya jata hai)
  googleClientId: (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
  // Followers khud lane ke liye. Khali ho to woh platform skip (purana number rehta hai)
  tavilyApiKey: (process.env.TAVILY_API_KEY || '').trim(),
  youtubeApiKey: (process.env.YOUTUBE_API_KEY || '').trim(),
  // Optional: regex se number na nikle to Groq ka sasta model text se nikale
  groqApiKey: (process.env.GROQ_API_KEY || '').trim(),
  groqModel: (process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim(),
  // Tasveerein Cloudinary pe (laga ho to sab uploads wahin). Ya poora CLOUDINARY_URL
  // (cloudinary://<api_key>:<api_secret>@<cloud_name>), ya teeno alag alag
  cloudinaryUrl: (process.env.CLOUDINARY_URL || '').trim(),
  cloudinaryCloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  cloudinaryApiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
  cloudinaryApiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  // Cloudinary ke andar is folder mein
  cloudinaryFolder: (process.env.CLOUDINARY_FOLDER || 'influencer-platform').trim(),
  // Vercel Cron yahi secret "Authorization: Bearer ..." mein bhejta hai
  cronSecret: (process.env.CRON_SECRET || '').trim(),
}

export const isProduction = env.nodeEnv === 'production'

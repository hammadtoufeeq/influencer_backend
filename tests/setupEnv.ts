// Har test file se pehle: test ke liye env variables
process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'
process.env.RATE_LIMIT = 'off'
// Tests kabhi asal Tavily / YouTube / Groq ko call na karein (.env mein key ho tab bhi)
process.env.TAVILY_API_KEY = ''
process.env.YOUTUBE_API_KEY = ''
process.env.GROQ_API_KEY = ''
process.env.CRON_SECRET = 'test-cron-secret'
process.env.FOLLOWERS_REFRESH_LIMIT_HOURS = '0'
// Tests mein tasveerein disk pe (Cloudinary kabhi nahi)
process.env.CLOUDINARY_URL = ''
process.env.CLOUDINARY_CLOUD_NAME = ''
process.env.CLOUDINARY_API_KEY = ''
process.env.CLOUDINARY_API_SECRET = ''

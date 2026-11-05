import { env } from '../../config/env'
import { toCount } from './parseCount'

const API = 'https://api.groq.com/openai/v1/chat/completions'

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

// Sirf fallback: regex se number na nikle to Groq ka model text mein se number dhoondhe.
// Model khud koi number nahi bana sakta: jo jawab de woh text mein lafz-ba-lafz hona chahiye
export async function groqExtractCount(text: string, handle: string): Promise<number | null> {
  if (!env.groqApiKey) return null
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.groqApiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: env.groqModel,
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: 'system',
            content:
              'You read text from a social media profile page. Reply with ONLY the follower or ' +
              'subscriber count of the given account, copied exactly as written in the text ' +
              '(for example "5.4M" or "1,234,567"). If the text does not state it, reply NONE.',
          },
          { role: 'user', content: `Account: @${handle}\n\nText:\n${text.slice(0, 4000)}` },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as ChatResponse
    const answer = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') ?? ''
    if (!answer || /none/i.test(answer)) return null
    // Text mein yahi likha ho, warna model ne ghar liya
    if (!text.toLowerCase().includes(answer.toLowerCase())) return null
    const match = answer.match(/^(\d[\d.,]*)\s?(thousand|million|billion|mln|mn|bn|k|m|b)?$/i)
    return match ? toCount(match[1], match[2]) : null
  } catch {
    return null
  }
}

// Search ke text se followers ka number: "5.4M Followers", "1,234,567 subscribers",
// "12.3K followers", "Followers: 2.1 million". "300 Following" ko nahi pakarta

const UNITS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  mln: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
}

const NUMBER = String.raw`(\d[\d.,]*)`
const UNIT = String.raw`(?:\s?(thousand|million|billion|mln|mn|bn|k|m|b)(?![a-z]))?`
const KEYWORD = String.raw`(followers|subscribers)`

// "5.4M Followers" (number pehle)
const NUMBER_FIRST = new RegExp(String.raw`${NUMBER}${UNIT}\+?\s*${KEYWORD}\b`, 'gi')
// "Followers: 5.4M" (lafz pehle, beech mein : ya -)
const KEYWORD_FIRST = new RegExp(String.raw`\b${KEYWORD}\s*[:\-–]\s*${NUMBER}${UNIT}`, 'gi')

// Dunya mein sab se zyada followers bhi is se kam hain: is se bara number ghalat parha gaya
const MAX_COUNT = 5_000_000_000

export function toCount(rawNumber: string, rawUnit?: string): number | null {
  const number = rawNumber.replace(/[.,]+$/, '')
  const unit = rawUnit ? UNITS[rawUnit.toLowerCase()] : undefined
  let value: number

  if (unit) {
    // "5.4" ya "1,2" (kuch zabanon mein comma decimal hai)
    const decimal = number.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '')
    if (!/^\d+(\.\d+)?$/.test(decimal)) return null
    value = Math.round(Number(decimal) * unit)
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(number)) {
    // "1,234,567" ya "1.234.567"
    value = Number(number.replace(/[.,]/g, ''))
  } else if (/^\d+$/.test(number)) {
    value = Number(number)
  } else {
    // "5.4 followers" (unit ke baghair): pakka nahi, andaza nahi lagate
    return null
  }

  if (!Number.isFinite(value) || value < 0 || value > MAX_COUNT) return null
  return value
}

export function parseFollowerCount(text: string): number | null {
  for (const pattern of [NUMBER_FIRST, KEYWORD_FIRST]) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const [number, unit] = pattern === NUMBER_FIRST ? [match[1], match[2]] : [match[2], match[3]]
      const count = toCount(number, unit)
      if (count !== null) return count
    }
  }
  return null
}

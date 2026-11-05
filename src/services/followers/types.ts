// Ek account ke followers dhoondne ka nateeja
//   ok: number mila (aur kis page se)
//   not_found: koi pakka number nahi mila (purana number rehta hai)
//   error: API ne jawab nahi diya
//   disabled: is platform ki API key nahi lagi (kuch nahi badalta)
export type LookupResult =
  | { status: 'ok'; count: number; sourceUrl: string }
  | { status: 'not_found' | 'error' | 'disabled' }

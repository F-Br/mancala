import LZString from 'lz-string'

export function encodeShareGame(gameText: string): string {
  const b64 = btoa(gameText).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const prefix = 'b64:'
  const candidate = prefix + b64
  if (candidate.length <= 250) return candidate
  const compressed = LZString.compressToEncodedURIComponent(gameText)
  return 'lz:' + compressed
}

export function decodeShareGame(encoded: string): string | null {
  try {
    if (encoded.startsWith('lz:')) {
      return LZString.decompressFromEncodedURIComponent(encoded.slice(3)) ?? null
    }
    if (encoded.startsWith('b64:')) {
      const b64 = encoded.slice(4).replace(/-/g, '+').replace(/_/g, '/')
      return atob(b64)
    }
    return null
  } catch {
    return null
  }
}

export async function shareGame(gameText: string, title: string): Promise<void> {
  const encoded = encodeShareGame(gameText)
  const url = `${window.location.origin}/?game=${encoded}`

  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }

  await navigator.clipboard.writeText(url)
}

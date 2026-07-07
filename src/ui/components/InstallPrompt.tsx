import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './Button'

const DISMISSED_KEY = 'mancala-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt({ visible }: { visible: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [promptActive, setPromptActive] = useState(false)
  const dismissedRef = useRef(() => localStorage.getItem(DISMISSED_KEY) === 'true')

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') setPromptActive(false)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setPromptActive(false)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }, [])

  useEffect(() => {
    if (!visible) {
      setPromptActive(false)
      return
    }
    if (!deferredPrompt) return
    if (dismissedRef.current()) return
    setPromptActive(true)
  }, [deferredPrompt, visible])

  return (
    <AnimatePresence>
      {promptActive && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 left-4 right-4 z-40 max-w-sm mx-auto"
        >
          <div className="bg-board rounded-2xl p-4 shadow-2xl border border-board/60 flex flex-col gap-3">
            <p className="text-sm text-text font-medium">
              Install Mancala for offline play and quick access
            </p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" className="flex-1" onClick={handleInstall}>
                Install Mancala
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDismiss}>
                Dismiss
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import { useNavigate } from 'react-router-dom'
import { strings } from '../strings'

interface PlaceholderScreenProps {
  title: string
  message: string
}

export function PlaceholderScreen({ title, message }: PlaceholderScreenProps) {
  const navigate = useNavigate()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-3xl font-bold text-text">{title}</h1>
      <p className="text-muted text-center">{message}</p>
      <button
        type="button"
        onClick={() => navigate('/home')}
        className="px-6 py-2 rounded-xl bg-accent text-bg font-semibold"
      >
        {strings.game.home}
      </button>
    </main>
  )
}

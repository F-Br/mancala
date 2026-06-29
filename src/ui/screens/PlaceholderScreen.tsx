interface PlaceholderScreenProps {
  title: string
  message: string
}

export function PlaceholderScreen({ title, message }: PlaceholderScreenProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-display-lg font-display font-semibold text-text">{title}</h1>
      <p className="text-muted text-center">{message}</p>
    </main>
  )
}

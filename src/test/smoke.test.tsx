import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { ThemeProvider } from '../ui/theme'
import { HomeScreen } from '../ui/screens/HomeScreen'

describe('HomeScreen', () => {
  it('renders the title', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <HomeScreen />
        </ThemeProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Mancala')).toBeInTheDocument()
  })
})

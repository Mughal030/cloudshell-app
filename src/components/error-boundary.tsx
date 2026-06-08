'use client'

import React from 'react'
import { Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[CloudShell] Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0d1117] text-[#c9d1d9]">
          <Terminal className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Jasbol Hack encountered an error</h2>
          <p className="text-sm text-[#8b949e] mb-4 max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            className="bg-[#238636] hover:bg-[#2ea043] text-white"
          >
            Reload Application
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

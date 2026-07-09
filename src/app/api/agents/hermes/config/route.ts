import { NextRequest, NextResponse } from 'next/server'

// DEPRECATED: Hermes/OpenCode Zen stack has been removed.
// This route is kept as a stub to prevent build errors.
export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'Hermes is deprecated. Use Claude Code with the free-claude-code proxy instead.',
    config: { isAdmin: false, keyConfigured: false, canManageKey: false, defaultModel: null },
    models: [],
  })
}

export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Hermes is deprecated. Use Claude Code with the free-claude-code proxy instead.',
  })
}

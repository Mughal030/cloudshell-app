import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenBasic, setUserApiKey, setUserPreferredProvider, getUserApiKeys } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const keys = getUserApiKeys(decoded.userId)
    // Mask the keys for security — never return full keys
    return NextResponse.json({
      nvidiaApiKey: keys.nvidiaApiKey ? `${keys.nvidiaApiKey.substring(0, 8)}...${keys.nvidiaApiKey.slice(-4)}` : null,
      nvidiaKeySet: !!keys.nvidiaApiKey,
      openrouterApiKey: keys.openrouterApiKey ? `${keys.openrouterApiKey.substring(0, 8)}...${keys.openrouterApiKey.slice(-4)}` : null,
      openrouterKeySet: !!keys.openrouterApiKey,
      preferredProvider: keys.preferredProvider || 'none',
    })
  } catch (error) {
    console.error('[API Keys GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { provider, apiKey, preferredProvider } = body as {
      provider?: 'nvidia' | 'openrouter'
      apiKey?: string
      preferredProvider?: 'nvidia' | 'openrouter' | 'none'
    }

    if (provider && apiKey !== undefined) {
      // Validate key format
      if (apiKey && provider === 'nvidia' && !apiKey.startsWith('nvapi-')) {
        return NextResponse.json({ error: 'NVIDIA API keys must start with "nvapi-"' }, { status: 400 })
      }
      if (apiKey && provider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
        return NextResponse.json({ error: 'OpenRouter API keys must start with "sk-or-"' }, { status: 400 })
      }
      const result = setUserApiKey(decoded.userId, provider, apiKey)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
    }

    if (preferredProvider) {
      const result = setUserPreferredProvider(decoded.userId, preferredProvider)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true, message: 'API key updated' })
  } catch (error) {
    console.error('[API Keys POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { provider } = body as { provider: 'nvidia' | 'openrouter' }

    if (provider) {
      setUserApiKey(decoded.userId, provider, '')
    }

    return NextResponse.json({ success: true, message: 'API key removed' })
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { AI_MODEL_SMART } from '@/lib/ai-models'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check the user's org plan — AI assistant is a Pro feature
    const { data: membership } = await supabaseAdmin
      .from('user_organization_memberships')
      .select('organization_id, organizations(plan)')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    const plan = (membership?.organizations as any)?.plan ?? 'starter'
    if (plan !== 'pro') {
      return NextResponse.json(
        { error: 'PLAN_LIMIT', message: 'The AI assistant is available on the Pro plan.' },
        { status: 403 }
      )
    }

    const { messages, category, currentPage, grantContext } = await request.json()

    const systemPrompt = `You are a helpful AI assistant for GrantGuardian, a grant management platform for nonprofits.

You help users with two types of questions:

1. PRODUCT HELP: How to use GrantGuardian features (adding grants, tracking expenses, managing compliance, team collaboration, etc.)
2. GRANT EXPERTISE: Federal grant compliance, OMB Uniform Guidance, eligibility questions, allowability, special conditions, reporting requirements, etc.

Current context:
- User is on page: ${currentPage || 'dashboard'}
${grantContext ? `- User is viewing grant: ${grantContext.grantName} (${grantContext.fundingAgency})` : ''}

Guidelines:
- Be concise and helpful
- For product questions, give step-by-step instructions
- For grant compliance questions, cite relevant regulations when possible
- If you're unsure about grant regulations, acknowledge uncertainty
- Suggest creating a support ticket for complex issues
- Use a friendly, professional tone

Response format:
- Keep responses under 250 words when possible
- Use bullet points for steps or lists
- Bold important terms or actions
- Don't use excessive formatting`

    // Claude expects the conversation to start with the user and to alternate
    // roles. The widget's greeting ("Hi! I'm your assistant...") is an assistant
    // message, so drop anything before the user's first message and merge any
    // back-to-back messages from the same side.
    const cleaned: { role: 'user' | 'assistant'; content: string }[] = []
    for (const msg of Array.isArray(messages) ? messages : []) {
      const role = msg?.role === 'assistant' ? 'assistant' : msg?.role === 'user' ? 'user' : null
      const content = typeof msg?.content === 'string' ? msg.content.trim() : ''
      if (!role || !content) continue
      if (cleaned.length === 0 && role !== 'user') continue
      const last = cleaned[cleaned.length - 1]
      if (last && last.role === role) last.content += '\n\n' + content
      else cleaned.push({ role, content })
    }
    if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'No question to answer' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: AI_MODEL_SMART,
      max_tokens: 1024,
      system: systemPrompt,
      messages: cleaned.slice(-20)   // keep the request small on long chats
    })

    const assistantMessage = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n')
      .trim() || 'I apologize, but I encountered an error processing your request.'

    return NextResponse.json({
      message: assistantMessage,
      usage: response.usage
    })

  } catch (error: any) {
    // Shows up in Vercel's function logs with the real reason (bad model name, API key, etc.)
    console.error('Help chat error:', error?.status, error?.message ?? error)
    return NextResponse.json(
      { error: 'Failed to get response from assistant' },
      { status: 500 }
    )
  }
}

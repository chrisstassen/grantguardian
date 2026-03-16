import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { messages, category, currentPage, grantContext } = await request.json()

    // Build system prompt based on category and context
    let systemPrompt = `You are a helpful AI assistant for GrantGuardian, a grant management platform for nonprofits.

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

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }))
    })

    const assistantMessage = response.content[0].type === 'text' 
      ? response.content[0].text 
      : 'I apologize, but I encountered an error processing your request.'

    return NextResponse.json({ 
      message: assistantMessage,
      usage: response.usage 
    })

  } catch (error: any) {
    console.error('Help chat error:', error)
    return NextResponse.json(
      { error: 'Failed to get response from assistant' },
      { status: 500 }
    )
  }
}
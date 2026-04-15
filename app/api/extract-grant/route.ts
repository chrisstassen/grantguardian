import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { file_data, media_type } = await request.json()

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: media_type.startsWith('image/') ? 'image' : 'document',
              source: {
                type: 'base64',
                media_type: media_type,
                data: file_data
              }
            } as any,
            {
              type: 'text',
              text: `You are a grant management assistant. Extract grant award details from this award letter document.

Return ONLY a valid JSON object with these exact fields:
{
  "grant_name": "full name of the grant program",
  "funding_agency": "name of the funding agency or organization",
  "program_type": "program abbreviation or type (e.g., EFSP, VOCA, NSGP)",
  "award_number": "grant or award number/identifier",
  "award_amount": numeric dollar amount as a number (no currency symbols, no commas),
  "period_start": "YYYY-MM-DD format start date, or null if not found",
  "period_end": "YYYY-MM-DD format end date, or null if not found",
  "requirements": [
    {
      "title": "requirement title",
      "description": "brief description of the requirement",
      "due_date": "YYYY-MM-DD format, or null if no specific date",
      "priority": "high, medium, or low based on language used"
    }
  ],
  "special_conditions": "any special conditions, restrictions, or notes mentioned (plain text, or null)"
}

For requirements, extract any compliance obligations, reporting deadlines, programmatic conditions, or administrative requirements mentioned. Include items like financial reports, progress reports, audit requirements, match requirements, etc.

If a field cannot be determined from the document, use null. For award_amount, use null if not found (not 0).
Return only the JSON object with no markdown, no explanation, no other text.`
            }
          ]
        }
      ]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : null

    if (!text) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    const cleanJson = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const extracted = JSON.parse(cleanJson)

    return NextResponse.json({ extracted })
  } catch (error: any) {
    console.error('Grant extraction error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to extract grant data' },
      { status: 500 }
    )
  }
}

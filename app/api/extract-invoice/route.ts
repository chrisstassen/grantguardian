import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { file_data, media_type } = await request.json()

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
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
              text: `Extract expense information from this invoice/receipt. Return ONLY a JSON object with these fields:
{
  "vendor": "vendor or payee name",
  "invoice_number": "invoice number, bill number, receipt number, or reference number (or null if not found)",
  "amount": numeric amount as a number (just the number, no currency symbol or commas),
  "date": "YYYY-MM-DD format",
  "description": "brief description of items/services"
}

If any field is unclear, use null. Return only the JSON object, no other text.`
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
    console.error('Invoice extraction error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to extract invoice data' },
      { status: 500 }
    )
  }
}

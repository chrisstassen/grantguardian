import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { file_data, media_type } = await request.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
              },
              {
                type: 'text',
                text: `Extract expense information from this invoice/receipt. Return ONLY a JSON object with these fields:
{
  "vendor": "vendor or payee name",
  "amount": numeric amount (just the number, no currency symbol),
  "date": "YYYY-MM-DD format",
  "description": "brief description of items/services",
  "category": "one of: Personnel, Travel, Equipment, Supplies, Contractual, Other (or null if unclear)"
}

If any field is unclear, use null. Return only the JSON object, no other text.`
              }
            ]
          }
        ]
      })
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to extract invoice data' },
      { status: 500 }
    )
  }
}
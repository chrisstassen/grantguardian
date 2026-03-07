import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { file_data, media_type, grant_info } = await request.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
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
                text: `You are analyzing a federal grant award letter. Extract compliance requirements and return them as a JSON array.

Grant Information (if provided):
- Grant Name: ${grant_info?.grant_name || 'Not specified'}
- Funding Agency: ${grant_info?.funding_agency || 'Not specified'}
- Award Amount: ${grant_info?.award_amount || 'Not specified'}
- Period Start: ${grant_info?.period_start || 'Not specified'}
- Period End: ${grant_info?.period_end || 'Not specified'}

Based on this award letter, identify ALL compliance requirements. Return ONLY a JSON array with this exact structure:

[
  {
    "title": "Brief requirement title",
    "description": "Detailed description of what's required",
    "due_date": "YYYY-MM-DD or null if not specified",
    "priority": "low|medium|high|critical",
    "policy_source": "OMB 2 CFR 200|FEMA PAPPG|VOCA Final Rule|Award Letter|Other",
    "policy_citation": "Specific section reference",
    "category": "reporting|financial|programmatic|closeout|monitoring"
  }
]

Common federal grant requirements to look for:
1. Quarterly/Annual financial reports (SF-425)
2. Progress reports (narrative updates)
3. Time and effort documentation (2 CFR § 200.430)
4. Procurement requirements (2 CFR § 200.318-200.327)
5. Indirect cost documentation
6. Equipment inventory (if applicable)
7. Subaward monitoring (if applicable)
8. Final closeout requirements (within 90 days of period end)
9. Audit requirements (Single Audit if >$750K)
10. Special conditions mentioned in the award letter

Calculate due dates based on the performance period when possible:
- Quarterly reports: 30 days after quarter end
- Annual reports: 90 days after year end
- Final report: 90 days after period end

Return ONLY the JSON array, no other text.`
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
      { error: error.message || 'Failed to analyze award letter' },
      { status: 500 }
    )
  }
}
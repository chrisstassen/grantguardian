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
                text: `You are analyzing a federal grant award letter. Extract compliance requirements AND special conditions. Return a JSON object with two arrays.

                Grant Information (if provided):
                - Grant Name: ${grant_info?.grant_name || 'Not specified'}
                - Funding Agency: ${grant_info?.funding_agency || 'Not specified'}
                - Award Amount: ${grant_info?.award_amount || 'Not specified'}
                - Period Start: ${grant_info?.period_start || 'Not specified'}
                - Period End: ${grant_info?.period_end || 'Not specified'}

                Return ONLY a JSON object with this exact structure:

                {
                "requirements": [
                    {
                    "title": "Brief requirement title",
                    "description": "Detailed description of what's required",
                    "due_date": "YYYY-MM-DD or null",
                    "priority": "low|medium|high|critical",
                    "policy_source": "OMB 2 CFR 200|FEMA PAPPG|VOCA Final Rule|Award Letter|Other",
                    "policy_citation": "Specific section reference",
                    "category": "reporting|financial|programmatic|closeout|monitoring"
                    }
                ],
                "special_conditions": [
                    {
                    "title": "Brief condition title",
                    "description": "Full text of the special condition",
                    "risk_level": "low|medium|high|critical",
                    "applies_to": "expenses|procurement|personnel|reporting|all",
                    "restriction_type": "prohibition|limitation|requirement|approval_needed"
                    }
                ]
                }

                COMPLIANCE REQUIREMENTS to identify:
                1. Quarterly/Annual financial reports (SF-425)
                2. Progress reports (narrative updates)
                3. Time and effort documentation (2 CFR § 200.430)
                4. Procurement requirements (2 CFR § 200.318-200.327)
                5. Indirect cost documentation
                6. Equipment inventory (if applicable)
                7. Subaward monitoring (if applicable)
                8. Final closeout requirements (within 90 days)
                9. Audit requirements (Single Audit if >$750K)

                SPECIAL CONDITIONS to look for:
                1. Prior approval requirements (equipment, budget changes, personnel)
                2. Cost sharing/match requirements
                3. Prohibited cost categories (construction, lobbying, etc.)
                4. Spending restrictions or caps
                5. Special reporting requirements beyond standard
                6. Procurement restrictions
                7. Geographic or beneficiary limitations
                8. Equipment purchase thresholds
                9. Indirect cost rate limitations
                10. Subrecipient monitoring requirements

                Calculate due dates based on performance period:
                - Quarterly reports: 30 days after quarter end
                - Annual reports: 90 days after year end  
                - Final report: 90 days after period end

                Return ONLY the JSON object, no other text.`
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
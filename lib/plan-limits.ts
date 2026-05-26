export type Plan = 'starter' | 'pro'

export const PLAN_LIMITS = {
  starter: {
    maxGrants: 5,
    maxMembers: 5,
    aiFeatures: false,
  },
  pro: {
    maxGrants: Infinity,
    maxMembers: Infinity,
    aiFeatures: true,
  },
} as const

export function isAtGrantLimit(plan: Plan, activeGrantCount: number): boolean {
  return activeGrantCount >= PLAN_LIMITS[plan].maxGrants
}

export function isAtMemberLimit(plan: Plan, memberCount: number): boolean {
  return memberCount >= PLAN_LIMITS[plan].maxMembers
}

export function hasAiFeatures(plan: Plan): boolean {
  return PLAN_LIMITS[plan].aiFeatures
}

// Helper functions to manage active organization in session

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('active_org_id')
}

export function setActiveOrgId(orgId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('active_org_id', orgId)
}

export function clearActiveOrgId(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('active_org_id')
}
'use client'

import { useOrganization } from '@/contexts/organization-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Building2, Check, ChevronsUpDown } from 'lucide-react'

export function OrganizationSwitcher() {
  const { activeOrg, organizations, switchOrganization, loading } = useOrganization()

  if (loading || organizations.length === 0) {
    return null
  }

  // Don't show switcher if user only belongs to one org
  if (organizations.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-md">
        <Building2 className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-medium text-slate-900">{activeOrg?.name}</span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="truncate">{activeOrg?.name || 'Select organization'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrganization(org.id)}
            className="cursor-pointer"
          >
            <Check
              className={`mr-2 h-4 w-4 ${
                activeOrg?.id === org.id ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div className="flex flex-col">
              <span>{org.name}</span>
              <span className="text-xs text-slate-500 capitalize">{org.role}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
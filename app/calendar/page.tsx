'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/contexts/organization-context'
import { AppLayout } from '@/components/app-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'

interface CalendarEvent {
  id: string
  type: 'requirement' | 'grant_end'
  title: string
  date: string
  grantId: string
  grantName: string
  fundingAgency: string
  priority?: string
  urgency: 'overdue' | 'critical' | 'upcoming' | 'future'
  daysUntil: number
  link: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function CalendarPage() {
  const router = useRouter()
  const { activeOrg, loading: orgLoading } = useOrganization()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    if (!activeOrg) return
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await fetch(`/api/user/calendar?orgId=${activeOrg.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (res.ok) {
      const data = await res.json()
      console.log('[Calendar page] API response:', data)
      console.log('[Calendar page] events count:', data.events?.length)
      console.log('[Calendar page] first few events:', data.events?.slice(0, 5))
      setEvents(data.events || [])
    } else {
      const err = await res.text()
      console.error('[Calendar page] API error:', res.status, err)
    }

    setLoading(false)
  }, [activeOrg, router])

  useEffect(() => {
    if (!orgLoading && activeOrg) loadEvents()
  }, [orgLoading, activeOrg, loadEvents])

  // ── Calendar grid helpers ──────────────────────────────────────────────

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1).getDay()       // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  // Build grid: 6 rows × 7 cols = 42 cells
  const cells: { date: Date | null; isCurrentMonth: boolean }[] = []

  // Leading days from previous month
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }
  // Trailing days to fill 42 cells
  let trailing = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, trailing++), isCurrentMonth: false })
  }

  const toDateKey = (d: Date) => d.toISOString().split('T')[0]

  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = e.date.split('T')[0]
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  const today = toDateKey(new Date())

  // ── Urgency styling ────────────────────────────────────────────────────

  const eventChipStyle = (urgency: string, type: string) => {
    if (type === 'grant_end') return 'bg-purple-100 text-purple-800 border-purple-200'
    if (urgency === 'overdue') return 'bg-red-100 text-red-800 border-red-200'
    if (urgency === 'critical') return 'bg-orange-100 text-orange-800 border-orange-200'
    if (urgency === 'upcoming') return 'bg-amber-100 text-amber-800 border-amber-200'
    return 'bg-blue-100 text-blue-700 border-blue-200'
  }

  const eventDotColor = (urgency: string, type: string) => {
    if (type === 'grant_end') return 'bg-purple-500'
    if (urgency === 'overdue') return 'bg-red-500'
    if (urgency === 'critical') return 'bg-orange-500'
    if (urgency === 'upcoming') return 'bg-amber-500'
    return 'bg-blue-500'
  }

  const urgencyLabel = (e: CalendarEvent) => {
    if (e.type === 'grant_end') return 'Grant End'
    if (e.urgency === 'overdue') return `${Math.abs(e.daysUntil)}d overdue`
    if (e.daysUntil === 0) return 'Due today'
    if (e.daysUntil === 1) return 'Due tomorrow'
    return `Due in ${e.daysUntil}d`
  }

  // ── Sidebar: upcoming events ───────────────────────────────────────────

  const upcomingEvents = events
    .filter(e => e.daysUntil >= -30 && e.daysUntil <= 60)
    .slice(0, 20)

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  // ── Navigation ─────────────────────────────────────────────────────────

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => { setCurrentDate(new Date()); setSelectedDate(today) }

  return (
    <AppLayout title="Deadline Calendar">
      <div className="flex gap-6">

        {/* ── Main calendar ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <Card>
            {/* Month navigation */}
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-xl font-bold text-slate-900 w-44 text-center">
                    {MONTHS[month]} {year}
                  </h2>
                  <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-200">
                {DAYS.map(d => (
                  <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              {loading ? (
                <div className="flex items-center justify-center py-24 text-slate-400">
                  <CalendarDays className="h-6 w-6 mr-2 animate-pulse" />
                  Loading...
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {cells.map((cell, idx) => {
                    if (!cell.date) return <div key={idx} />
                    const key = toDateKey(cell.date)
                    const dayEvents = eventsByDate[key] || []
                    const isToday = key === today
                    const isSelected = key === selectedDate
                    const isCurrentMonth = cell.isCurrentMonth

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDate(key === selectedDate ? null : key)}
                        className={`min-h-[90px] p-1.5 border-b border-r border-slate-100 cursor-pointer transition-colors
                          ${!isCurrentMonth ? 'bg-slate-50/50' : 'bg-white hover:bg-slate-50'}
                          ${isSelected ? 'ring-2 ring-inset ring-blue-400' : ''}
                        `}
                      >
                        {/* Date number */}
                        <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-slate-800' : 'text-slate-300'}
                        `}>
                          {cell.date.getDate()}
                        </div>

                        {/* Event chips — show up to 2, then "+N more" */}
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 2).map(e => (
                            <div
                              key={e.id}
                              className={`text-xs px-1.5 py-0.5 rounded border truncate flex items-center gap-1 ${eventChipStyle(e.urgency, e.type)}`}
                              title={`${e.title} — ${e.grantName}`}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${eventDotColor(e.urgency, e.type)}`} />
                              <span className="truncate">{e.title}</span>
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-slate-500 pl-1">
                              +{dayEvents.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selected date detail */}
          {selectedDate && selectedEvents.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedEvents.map(e => (
                  <a
                    key={e.id}
                    href={e.link}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-blue-300 transition-colors block"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${eventDotColor(e.urgency, e.type)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-slate-900 text-sm">{e.title}</p>
                        <Badge className={`text-xs border ${eventChipStyle(e.urgency, e.type)}`}>
                          {urgencyLabel(e)}
                        </Badge>
                        {e.type === 'requirement' && e.priority && (
                          <Badge variant="outline" className="text-xs">{e.priority}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{e.grantName} · {e.fundingAgency}</p>
                    </div>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* Legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pb-4">
              {[
                { color: 'bg-red-500', label: 'Overdue' },
                { color: 'bg-orange-500', label: 'Due within 7 days' },
                { color: 'bg-amber-500', label: 'Due within 30 days' },
                { color: 'bg-blue-500', label: 'Upcoming requirement' },
                { color: 'bg-purple-500', label: 'Grant period end' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm text-slate-700">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.color}`} />
                  {item.label}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Upcoming deadlines list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600">
                Coming Up
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {loading ? (
                <p className="text-sm text-slate-400">Loading...</p>
              ) : upcomingEvents.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No upcoming deadlines</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map(e => (
                    <a
                      key={e.id}
                      href={e.link}
                      className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0 hover:text-blue-600 group"
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${eventDotColor(e.urgency, e.type)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 group-hover:text-blue-600 truncate leading-snug">
                          {e.title}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{e.grantName}</p>
                        <p className={`text-xs font-medium mt-0.5 ${
                          e.urgency === 'overdue' ? 'text-red-600' :
                          e.urgency === 'critical' ? 'text-orange-600' :
                          e.urgency === 'upcoming' ? 'text-amber-600' :
                          e.type === 'grant_end' ? 'text-purple-600' :
                          'text-blue-600'
                        }`}>
                          {urgencyLabel(e)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          {!loading && (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-2">
                {[
                  { label: 'Overdue', count: events.filter(e => e.urgency === 'overdue').length, color: 'text-red-600' },
                  { label: 'Due this week', count: events.filter(e => e.urgency === 'critical').length, color: 'text-orange-600' },
                  { label: 'Due this month', count: events.filter(e => e.urgency === 'upcoming').length, color: 'text-amber-600' },
                  { label: 'Total tracked', count: events.length, color: 'text-slate-700' },
                ].map(stat => (
                  <div key={stat.label} className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{stat.label}</span>
                    <span className={`font-bold ${stat.color}`}>{stat.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Zap,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Leaf,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { docTreeApi, type CalendarEvent } from "../api/doc-tree";
import { Button } from "@/components/ui/button";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatTimeRange(start: string | null, end: string | null) {
  if (!start) return "All day";
  const s = formatTime(start);
  const e = end ? formatTime(end) : "";
  return e ? `${s} - ${e}` : s;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

function eventColor(event: CalendarEvent, isCurrentDay: boolean): string {
  if (isCurrentDay) return "bg-primary text-primary-foreground";
  return "bg-card border border-border";
}

export function AgentCalendarTab({
  agentName,
  companyId,
}: {
  agentName: string;
  companyId: string;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);

  const timeMin = useMemo(() => {
    const d = new Date(weekDates[0]);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [weekDates]);

  const timeMax = useMemo(() => {
    const d = new Date(weekDates[6]);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [weekDates]);

  const eventsQuery = useQuery({
    queryKey: ["google-calendar", companyId, timeMin, timeMax],
    queryFn: () => docTreeApi.listCalendarEvents(companyId, timeMin, timeMax),
    enabled: !!companyId,
    retry: false,
    refetchInterval: 120_000,
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const d of weekDates) {
      map.set(d.toDateString(), []);
    }
    for (const event of eventsQuery.data?.events ?? []) {
      const start = event.start ? new Date(event.start) : null;
      if (start) {
        const key = start.toDateString();
        map.get(key)?.push(event);
      }
    }
    return map;
  }, [eventsQuery.data, weekDates]);

  // Upcoming: next event from now
  const upcoming = useMemo(() => {
    const now = Date.now();
    return (eventsQuery.data?.events ?? []).find((e) => e.start && new Date(e.start).getTime() > now) ?? null;
  }, [eventsQuery.data]);

  // Today's events
  const todayEvents = useMemo(() => {
    const today = new Date().toDateString();
    return eventsByDay.get(today) ?? [];
  }, [eventsByDay]);

  const totalEvents = eventsQuery.data?.events.length ?? 0;
  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1">
            Strategic Management
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Agent Execution Schedule
          </h2>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-sm border border-border">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
              Active Monitoring
            </span>
          </div>
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-sm border border-border">
            <RefreshCw className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
              {eventsQuery.isLoading ? "Syncing..." : eventsQuery.error ? "Not Connected" : "Synced with Google Calendar"}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-sm border border-border">
            <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left Column: Briefing + Syncs + Efficiency */}
        <div className="col-span-12 lg:col-span-3 space-y-5">
          {/* Upcoming Briefing */}
          <div className="bg-card rounded-sm p-5 border border-border">
            <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.15em] mb-4">
              Upcoming Briefing
            </h3>
            {upcoming ? (
              <div className="space-y-3">
                <div>
                  <p className="text-base font-bold text-foreground leading-tight">{upcoming.summary}</p>
                  {upcoming.location && (
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-bold">
                      {upcoming.location}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground bg-muted p-2 rounded-sm">
                  <span>{formatTime(upcoming.start)}</span>
                  <span className="text-primary">
                    {upcoming.start
                      ? `In ${Math.max(0, Math.round((new Date(upcoming.start).getTime() - Date.now()) / 60000))}m`
                      : ""}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No upcoming events</p>
            )}
          </div>

          {/* Today's Schedule */}
          <div className="bg-card rounded-sm p-5 border border-border">
            <h3 className="text-[10px] font-black text-foreground uppercase tracking-[0.15em] mb-5">
              Today's Schedule
            </h3>
            <div className="space-y-4">
              {todayEvents.length === 0 && (
                <p className="text-xs text-muted-foreground">No events today</p>
              )}
              {todayEvents.map((event, i) => (
                <div key={event.id} className="flex gap-3 items-start">
                  <div className={`w-[2px] h-10 rounded-full ${i === 0 ? "bg-primary/60" : "bg-muted-foreground/20"}`} />
                  <div>
                    <p className="text-xs font-bold text-foreground">{event.summary}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatTimeRange(event.start, event.end)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Efficiency */}
          <div className="bg-muted/30 rounded-sm p-5 border border-border">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-3">
              Schedule Density
            </h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-light text-foreground">
                {totalEvents > 0 ? Math.min(100, Math.round((totalEvents / 35) * 100)) : 0}
                <span className="text-sm font-bold text-primary">%</span>
              </span>
              <span className="text-[10px] font-bold text-primary">
                {totalEvents > 20 ? "BUSY" : totalEvents > 10 ? "MODERATE" : "LIGHT"}
              </span>
            </div>
            <div className="w-full bg-muted h-[2px]">
              <div
                className="bg-primary h-full"
                style={{ width: `${Math.min(100, Math.round((totalEvents / 35) * 100))}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              {totalEvents} events this week for {agentName}.
            </p>
          </div>
        </div>

        {/* Right Column: Main Calendar */}
        <div className="col-span-12 lg:col-span-9 space-y-5">
          <div className="bg-card rounded-sm border border-border overflow-hidden">
            {/* Week navigation */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold text-foreground">{weekLabel}</span>
              <div className="flex gap-1">
                {weekOffset !== 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                    Today
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {weekDates.map((d, i) => {
                const today = isToday(d);
                const isWeekend = i >= 5;
                return (
                  <div
                    key={i}
                    className={`py-3 text-center ${today ? "bg-accent/50 border-x border-primary/20" : ""} ${isWeekend ? "opacity-30" : ""}`}
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${today ? "text-primary" : "text-muted-foreground"}`}>
                      {DAY_NAMES[(i + 1) % 7]}
                    </p>
                    <p className={`text-lg ${today ? "font-bold text-primary" : "font-light text-foreground"}`}>
                      {d.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Calendar body */}
            <div className="grid grid-cols-7 min-h-[420px]">
              {/* Grid lines background */}
              {weekDates.map((d, i) => {
                const today = isToday(d);
                const isWeekend = i >= 5;
                const dayEvents = eventsByDay.get(d.toDateString()) ?? [];

                return (
                  <div
                    key={i}
                    className={`p-2 border-r border-border/10 space-y-2 ${today ? "bg-accent/20" : ""} ${isWeekend ? "opacity-20" : ""}`}
                  >
                    {dayEvents.map((event) => {
                      const isCurrent = today;
                      return (
                        <a
                          key={event.id}
                          href={event.htmlLink ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block p-2.5 rounded-sm transition-all group ${
                            isCurrent
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "bg-muted/50 border border-border hover:border-primary/30"
                          }`}
                        >
                          <p className={`text-[11px] font-semibold leading-tight truncate ${
                            isCurrent ? "text-primary-foreground" : "text-foreground"
                          }`}>
                            {event.summary}
                          </p>
                          <p className={`text-[9px] font-bold uppercase mt-1 ${
                            isCurrent ? "text-primary-foreground/80" : "text-muted-foreground"
                          }`}>
                            {formatTimeRange(event.start, event.end)}
                          </p>
                          {event.attendees.length > 0 && (
                            <p className={`text-[8px] mt-1 truncate ${
                              isCurrent ? "text-primary-foreground/60" : "text-muted-foreground/60"
                            }`}>
                              {event.attendees.length} attendee{event.attendees.length > 1 ? "s" : ""}
                            </p>
                          )}
                        </a>
                      );
                    })}

                    {dayEvents.length === 0 && !isWeekend && (
                      <div className="h-16 border border-dashed border-border/30 rounded-sm flex items-center justify-center mt-2">
                        <span className="text-[10px] text-muted-foreground/30 font-bold uppercase">Open</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Metrics */}
          <div className="flex gap-4">
            <div className="flex-1 bg-card rounded-sm p-4 flex items-center gap-3 border border-border">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Week Events</p>
                <p className="text-sm font-bold text-foreground">{totalEvents} Scheduled</p>
              </div>
            </div>
            <div className="flex-1 bg-card rounded-sm p-4 flex items-center gap-3 border border-border">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Today</p>
                <p className="text-sm font-bold text-foreground">{todayEvents.length} Events</p>
              </div>
            </div>
            <div className="flex-1 bg-card rounded-sm p-4 flex items-center gap-3 border border-border">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <Leaf className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</p>
                <p className="text-sm font-bold text-foreground">
                  {eventsQuery.error ? "Not Connected" : "Synced"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

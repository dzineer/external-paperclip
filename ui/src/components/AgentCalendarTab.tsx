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

// Google Calendar color IDs → Tailwind classes
const GCAL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "1":  { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-900 dark:text-violet-100",   border: "border-violet-300 dark:border-violet-700" },   // Lavender
  "2":  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-900 dark:text-emerald-100", border: "border-emerald-300 dark:border-emerald-700" }, // Sage
  "3":  { bg: "bg-purple-100 dark:bg-purple-900/40",   text: "text-purple-900 dark:text-purple-100",   border: "border-purple-300 dark:border-purple-700" },   // Grape
  "4":  { bg: "bg-pink-100 dark:bg-pink-900/40",       text: "text-pink-900 dark:text-pink-100",       border: "border-pink-300 dark:border-pink-700" },       // Flamingo
  "5":  { bg: "bg-yellow-100 dark:bg-yellow-900/40",   text: "text-yellow-900 dark:text-yellow-100",   border: "border-yellow-300 dark:border-yellow-700" },   // Banana
  "6":  { bg: "bg-orange-100 dark:bg-orange-900/40",   text: "text-orange-900 dark:text-orange-100",   border: "border-orange-300 dark:border-orange-700" },   // Tangerine
  "7":  { bg: "bg-cyan-100 dark:bg-cyan-900/40",       text: "text-cyan-900 dark:text-cyan-100",       border: "border-cyan-300 dark:border-cyan-700" },       // Peacock
  "8":  { bg: "bg-gray-200 dark:bg-gray-800/40",       text: "text-gray-900 dark:text-gray-100",       border: "border-gray-400 dark:border-gray-600" },       // Graphite
  "9":  { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-900 dark:text-blue-100",       border: "border-blue-300 dark:border-blue-700" },       // Blueberry
  "10": { bg: "bg-green-100 dark:bg-green-900/40",     text: "text-green-900 dark:text-green-100",     border: "border-green-300 dark:border-green-700" },     // Basil
  "11": { bg: "bg-red-100 dark:bg-red-900/40",         text: "text-red-900 dark:text-red-100",         border: "border-red-300 dark:border-red-700" },         // Tomato
};

function getEventColors(colorId: string | null) {
  if (colorId && GCAL_COLORS[colorId]) return GCAL_COLORS[colorId];
  return null;
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
        {/* Left Column (Briefing, Today's Schedule, Schedule Density) — hidden */}

        {/* Main Calendar — full width */}
        <div className="col-span-12 space-y-5">
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
                      const colors = getEventColors(event.colorId);
                      return (
                        <a
                          key={event.id}
                          href={event.htmlLink ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block p-2.5 rounded-sm transition-all group ${
                            isCurrent && !colors
                              ? "bg-primary text-primary-foreground shadow-md"
                              : colors
                                ? `${colors.bg} border ${colors.border} hover:shadow-sm`
                                : "bg-muted/50 border border-border hover:border-primary/30"
                          }`}
                        >
                          <p className={`text-[11px] font-semibold leading-tight truncate ${
                            isCurrent && !colors ? "text-primary-foreground" : colors ? colors.text : "text-foreground"
                          }`}>
                            {event.summary}
                          </p>
                          <p className={`text-[9px] font-bold uppercase mt-1 ${
                            isCurrent && !colors ? "text-primary-foreground/80" : colors ? `${colors.text} opacity-70` : "text-muted-foreground"
                          }`}>
                            {formatTimeRange(event.start, event.end)}
                          </p>
                          {event.attendees.length > 0 && (
                            <p className={`text-[8px] mt-1 truncate ${
                              isCurrent && !colors ? "text-primary-foreground/60" : colors ? `${colors.text} opacity-50` : "text-muted-foreground/60"
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

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Mail,
  Calendar,
  FileText,
  Clock,
  Users,
  Inbox,
  Send,
  Star,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Shield,
} from "lucide-react";
import { docTreeApi, type CalendarEvent, type GoogleDriveFile } from "../api/doc-tree";
import { Input } from "@/components/ui/input";

function relTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(iso: string | null) {
  if (!iso) return "All day";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function AndrewsDeskTab({
  companyId,
}: {
  companyId: string;
}) {
  const [emailSearch, setEmailSearch] = useState("");

  // Calendar events (this week)
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const calendarQuery = useQuery({
    queryKey: ["andrews-desk-calendar", companyId],
    queryFn: () => docTreeApi.listCalendarEvents(companyId, now.toISOString(), weekEnd.toISOString()),
    enabled: !!companyId,
    retry: false,
    refetchInterval: 120_000,
  });

  // Google Drive recent files
  const driveQuery = useQuery({
    queryKey: ["andrews-desk-drive", companyId],
    queryFn: () => docTreeApi.listGoogleDrive(companyId),
    enabled: !!companyId,
    retry: false,
  });

  const todayEvents = useMemo(() => {
    const today = new Date().toDateString();
    return (calendarQuery.data?.events ?? []).filter(
      (e) => e.start && new Date(e.start).toDateString() === today,
    );
  }, [calendarQuery.data]);

  const upcomingEvents = useMemo(() => {
    const today = new Date().toDateString();
    return (calendarQuery.data?.events ?? []).filter(
      (e) => e.start && new Date(e.start).toDateString() !== today,
    ).slice(0, 8);
  }, [calendarQuery.data]);

  const recentFiles = driveQuery.data?.files.slice(0, 6) ?? [];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <section className="flex justify-between items-end">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-sm bg-card border border-border overflow-hidden flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary/60" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary rounded-full border-[3px] border-background flex items-center justify-center">
              <div className="w-1 h-1 bg-primary-foreground rounded-full animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
              Andrew's Desk
            </h2>
            <p className="text-sm text-muted-foreground">
              CEO Command Center — Email, Calendar, Documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-sm border border-border">
          <RefreshCw className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left: Today's Schedule + Quick Actions */}
        <div className="col-span-12 lg:col-span-4 space-y-5">
          {/* Today's Schedule */}
          <div className="bg-card rounded-sm p-5 border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-black text-foreground uppercase tracking-[0.15em]">
                Today's Schedule
              </h3>
              <span className="ml-auto text-[10px] text-primary font-bold">
                {todayEvents.length} events
              </span>
            </div>
            <div className="space-y-3">
              {todayEvents.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No events today</p>
              )}
              {todayEvents.map((event) => (
                <a
                  key={event.id}
                  href={event.htmlLink ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 items-start group hover:bg-accent/30 p-2 -mx-2 rounded-sm transition-colors"
                >
                  <div className="w-[2px] h-10 bg-primary/60 rounded-full shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {event.summary}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatTime(event.start)}
                      {event.attendees.length > 0 && ` · ${event.attendees.length} attendees`}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Upcoming This Week */}
          <div className="bg-card rounded-sm p-5 border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.15em]">
                Upcoming This Week
              </h3>
            </div>
            <div className="space-y-2.5">
              {upcomingEvents.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No upcoming events</p>
              )}
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 text-xs">
                  <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0">
                    {event.start ? new Date(event.start).toLocaleDateString("en-US", { weekday: "short" }) : ""}
                  </span>
                  <span className="text-foreground truncate flex-1">{event.summary}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatTime(event.start)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-muted/30 rounded-sm p-5 border border-border">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-3">
              Week Overview
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-2xl font-extrabold text-foreground">
                  {calendarQuery.data?.events.length ?? 0}
                </span>
                <p className="text-[10px] text-muted-foreground">Events</p>
              </div>
              <div>
                <span className="text-2xl font-extrabold text-foreground">
                  {recentFiles.length}
                </span>
                <p className="text-[10px] text-muted-foreground">Recent Files</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recent Documents + Drive */}
        <div className="col-span-12 lg:col-span-8 space-y-5">
          {/* Recent Google Drive Files */}
          <div className="bg-card rounded-sm border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-black text-foreground uppercase tracking-[0.15em] flex-1">
                Recent Documents
              </h3>
              <span className="text-[10px] text-muted-foreground">Google Drive</span>
            </div>

            {driveQuery.isLoading && (
              <div className="px-5 py-6 text-xs text-muted-foreground">Loading...</div>
            )}
            {driveQuery.error && (
              <div className="px-5 py-6 text-xs text-muted-foreground">Google Drive not connected</div>
            )}

            <div className="divide-y divide-border">
              {recentFiles.map((file) => (
                <a
                  key={file.id}
                  href={file.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 px-5 py-3 hover:bg-accent/30 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center bg-muted rounded-sm shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {file.owner && `${file.owner} · `}
                      {file.modifiedTime && relTime(file.modifiedTime)}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>

          {/* Calendar Week View */}
          <div className="bg-card rounded-sm border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-black text-foreground uppercase tracking-[0.15em] flex-1">
                This Week's Calendar
              </h3>
              {calendarQuery.error && (
                <span className="text-[10px] text-muted-foreground">Not connected</span>
              )}
            </div>
            <div className="p-5">
              {calendarQuery.isLoading && (
                <p className="text-xs text-muted-foreground">Loading calendar...</p>
              )}
              {(calendarQuery.data?.events ?? []).length === 0 && !calendarQuery.isLoading && (
                <p className="text-xs text-muted-foreground">No events this week</p>
              )}
              <div className="space-y-2">
                {(calendarQuery.data?.events ?? []).slice(0, 10).map((event) => {
                  const isToday = event.start && new Date(event.start).toDateString() === new Date().toDateString();
                  return (
                    <a
                      key={event.id}
                      href={event.htmlLink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-4 p-2.5 rounded-sm transition-colors group ${
                        isToday ? "bg-primary/5 border border-primary/20" : "hover:bg-accent/30"
                      }`}
                    >
                      <div className="w-12 text-center shrink-0">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">
                          {event.start ? new Date(event.start).toLocaleDateString("en-US", { weekday: "short" }) : ""}
                        </p>
                        <p className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                          {event.start ? new Date(event.start).getDate() : ""}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {event.summary}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatTime(event.start)}
                          {event.location && ` · ${event.location}`}
                        </p>
                      </div>
                      {event.attendees.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{event.attendees.length}</span>
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

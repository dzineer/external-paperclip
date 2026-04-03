import { useMemo } from "react";
import { useParams, NavLink } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  LayoutDashboard,
  Calendar,
  FolderTree,
  Mail,
  Brain,
  CalendarPlus,
  ClipboardList,
  Circle,
  ExternalLink,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { docTreeApi, type GmailMessage } from "../api/doc-tree";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { AndrewsDeskTab } from "../components/AndrewsDeskTab";
import { AgentCalendarTab } from "../components/AgentCalendarTab";
import { AgentDocumentsTab } from "../components/AgentDocumentsTab";
import { AgentBrainTab } from "../components/AgentBrainTab";
import { PerfWeekCalendar } from "../components/PerfWeekCalendar";
import type { Agent } from "@paperclipai/shared";

const DESK_SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "documents", label: "Documents", icon: FolderTree },
  { key: "email", label: "Email", icon: Mail },
  { key: "brain", label: "Brain", icon: Brain },
] as const;

type DeskSection = (typeof DESK_SECTIONS)[number]["key"];

// Keywords that indicate a scheduling-related email
const SCHEDULE_KEYWORDS = [
  "meeting", "schedule", "calendar", "appointment", "call",
  "sync", "standup", "stand-up", "1:1", "one-on-one",
  "invite", "rsvp", "agenda", "reschedule", "cancel meeting",
  "zoom", "google meet", "teams", "webex", "conference",
  "book", "slot", "availability", "free time", "catch up",
];

function isSchedulingEmail(msg: GmailMessage): boolean {
  const text = `${msg.subject ?? ""} ${msg.snippet}`.toLowerCase();
  return SCHEDULE_KEYWORDS.some((kw) => text.includes(kw));
}

function formatEmailDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function extractName(from: string | null) {
  if (!from) return "Unknown";
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0];
}

function DeskEmailPanel({ companyId }: { companyId: string }) {
  const gmailQuery = useQuery({
    queryKey: ["desk-gmail", companyId],
    queryFn: () => docTreeApi.listGmail(companyId, undefined, 20),
    enabled: !!companyId,
    retry: false,
    refetchInterval: 120_000,
  });

  const { scheduling, tasks } = useMemo(() => {
    const messages = gmailQuery.data?.messages ?? [];
    const scheduling: GmailMessage[] = [];
    const tasks: GmailMessage[] = [];

    for (const msg of messages) {
      if (isSchedulingEmail(msg)) {
        scheduling.push(msg);
      } else {
        tasks.push(msg);
      }
    }
    return { scheduling, tasks };
  }, [gmailQuery.data]);

  if (gmailQuery.error) {
    return (
      <div className="bg-card rounded-sm border border-border p-5 text-center">
        <Mail className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Gmail not connected</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* To Schedule */}
      <div className="bg-card rounded-sm border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-orange-500" />
          <h3 className="text-xs font-black text-foreground uppercase tracking-[0.15em] flex-1">
            To Schedule
          </h3>
          <span className="text-[10px] font-bold text-orange-500">
            {scheduling.length}
          </span>
        </div>
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {gmailQuery.isLoading && (
            <div className="px-5 py-6 text-xs text-muted-foreground">Loading emails...</div>
          )}
          {!gmailQuery.isLoading && scheduling.length === 0 && (
            <div className="px-5 py-6 text-xs text-muted-foreground text-center">
              No scheduling emails found
            </div>
          )}
          {scheduling.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-accent/30 transition-colors group"
            >
              <div className="mt-1 shrink-0">
                {msg.isUnread ? (
                  <Circle className="h-2 w-2 fill-orange-500 text-orange-500" />
                ) : (
                  <Circle className="h-2 w-2 text-muted-foreground/20" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-foreground truncate">
                    {extractName(msg.from)}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatEmailDate(msg.date)}
                  </span>
                </div>
                <p className={`text-xs truncate ${msg.isUnread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                  {msg.subject ?? "(no subject)"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {msg.snippet}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks / Action Items */}
      <div className="bg-card rounded-sm border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black text-foreground uppercase tracking-[0.15em] flex-1">
            Tasks
          </h3>
          <span className="text-[10px] font-bold text-primary">
            {tasks.length}
          </span>
        </div>
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {gmailQuery.isLoading && (
            <div className="px-5 py-6 text-xs text-muted-foreground">Loading emails...</div>
          )}
          {!gmailQuery.isLoading && tasks.length === 0 && (
            <div className="px-5 py-6 text-xs text-muted-foreground text-center">
              No task emails found
            </div>
          )}
          {tasks.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-accent/30 transition-colors group"
            >
              <div className="mt-1 shrink-0">
                {msg.isUnread ? (
                  <Circle className="h-2 w-2 fill-primary text-primary" />
                ) : (
                  <Circle className="h-2 w-2 text-muted-foreground/20" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-foreground truncate">
                    {extractName(msg.from)}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatEmailDate(msg.date)}
                  </span>
                </div>
                <p className={`text-xs truncate ${msg.isUnread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                  {msg.subject ?? "(no subject)"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {msg.snippet}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AndrewsDesk() {
  const { section } = useParams<{ section?: string }>();
  const activeSection: DeskSection =
    DESK_SECTIONS.find((s) => s.key === section)?.key ?? "overview";

  const { selectedCompanyId } = useCompany();
  useBreadcrumbs([{ label: "Andrew's Desk" }]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const ceoAgent = useMemo(
    () => (agents ?? []).find((a: Agent) => a.role === "ceo") ?? null,
    [agents],
  );

  if (!selectedCompanyId) return null;

  return (
    <div className="flex h-full">
      {/* Left Nav — hidden for now
      <nav className="w-[220px] shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Andrew's Desk</h2>
              <p className="text-[10px] text-muted-foreground">CEO Command Center</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 p-2 flex-1">
          {DESK_SECTIONS.map(({ key, label, icon: Icon }) => (
            <NavLink
              key={key}
              to={key === "overview" ? "/desk" : `/desk/${key}`}
              end={key === "overview"}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-sm transition-colors",
                activeSection === key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-medium text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </nav>
      */}

      {/* Right Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeSection === "overview" && (
          <>
            <AndrewsDeskTab companyId={selectedCompanyId} />
            <div className="mt-8">
              <AgentCalendarTab
                agentName="Andrew"
                companyId={selectedCompanyId}
              />
            </div>
            <div className="mt-8">
              <PerfWeekCalendar />
            </div>
            <div className="mt-8">
              <DeskEmailPanel companyId={selectedCompanyId} />
            </div>
          </>
        )}

        {activeSection === "calendar" && (
          <AgentCalendarTab
            agentName="Andrew"
            companyId={selectedCompanyId}
          />
        )}

        {activeSection === "documents" && ceoAgent && (
          <AgentDocumentsTab
            agentId={ceoAgent.id}
            companyId={selectedCompanyId}
          />
        )}
        {activeSection === "documents" && !ceoAgent && (
          <div className="text-sm text-muted-foreground">Loading agent data...</div>
        )}

        {activeSection === "email" && (
          <DeskEmailPanel companyId={selectedCompanyId} />
        )}

        {activeSection === "brain" && ceoAgent && (
          <AgentBrainTab
            agentId={ceoAgent.id}
            agentName="Andrew"
            agentTitle="CEO"
            companyId={selectedCompanyId}
          />
        )}
        {activeSection === "brain" && !ceoAgent && (
          <div className="text-sm text-muted-foreground">Loading agent data...</div>
        )}
      </main>
    </div>
  );
}

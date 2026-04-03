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
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { AndrewsDeskTab } from "../components/AndrewsDeskTab";
import { AgentCalendarTab } from "../components/AgentCalendarTab";
import { AgentDocumentsTab } from "../components/AgentDocumentsTab";
import { AgentBrainTab } from "../components/AgentBrainTab";
import type { Agent } from "@paperclipai/shared";

const DESK_SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "documents", label: "Documents", icon: FolderTree },
  { key: "email", label: "Email", icon: Mail },
  { key: "brain", label: "Brain", icon: Brain },
] as const;

type DeskSection = (typeof DESK_SECTIONS)[number]["key"];

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
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-1">Email Integration</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Gmail integration coming soon. View and manage emails directly from your desk.
            </p>
          </div>
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

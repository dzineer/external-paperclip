import { Shield } from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";

export function SidebarDesk() {
  return (
    <SidebarNavItem
      to="/desk"
      label="Andrew's Desk"
      icon={Shield}
    />
  );
}

import {
  BarChart3,
  Bell,
  Cloud,
  DollarSign,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  Server,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/",
    icon: LayoutDashboard,
    description: "Pipeline, capacity loop, and key metrics at a glance",
  },
  {
    label: "Forecast",
    href: "/forecast",
    icon: TrendingUp,
    description: "Demand forecasts with P50/P90 confidence bands",
  },
  {
    label: "Capacity",
    href: "/capacity",
    icon: Server,
    description: "Recommended capacity and scaling decisions",
  },
  {
    label: "Confidence",
    href: "/confidence",
    icon: Gauge,
    description: "Model calibration, coverage, and fallback status",
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: Bell,
    description: "Approval workflow for proposed scaling actions",
  },
  {
    label: "Cost & SLA",
    href: "/cost-sla",
    icon: DollarSign,
    description: "Spend, SLA violations, and scaling events",
  },
  {
    label: "Benchmarking",
    href: "/benchmarking",
    icon: BarChart3,
    description: "Model accuracy, latency, and cost comparison",
  },
  {
    label: "Tutorial",
    href: "/tutorial",
    icon: GraduationCap,
    description: "What this dashboard does, the key terms, and a guided tour of every feature",
  },
  {
    label: "AWS Accounts",
    href: "/accounts",
    icon: Cloud,
    description: "Connect AWS accounts (simulated cross-account IAM role) and tune scaling policy",
  },
];

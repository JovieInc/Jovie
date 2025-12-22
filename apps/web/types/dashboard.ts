export interface DashboardBreadcrumbItem {
  label: string;
  href?: string;
}

export interface SaveStatus {
  saving: boolean;
  success: boolean | null;
  error: string | null;
  lastSaved: Date | null;
}

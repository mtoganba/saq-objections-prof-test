import type { Route, CaseTab } from "../../types";

export function routeFromPath(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "cases" && parts[1]) {
    const tab = ["overview", "review", "documents", "history"].includes(
      parts[2],
    )
      ? (parts[2] as CaseTab)
      : "review";
    try {
      return { page: "detail", caseId: decodeURIComponent(parts[1]), tab };
    } catch {
      return { page: "registry" };
    }
  }
  if (["sessions", "sources", "processes"].includes(parts[0]))
    return { page: parts[0] as Route["page"] };
  return { page: "registry" };
}

export function pathForRoute(route: Route): string {
  if (route.page === "detail")
    return `/cases/${encodeURIComponent(route.caseId || "")}/${route.tab || "review"}`;
  return route.page === "registry" ? "/cases" : `/${route.page}`;
}

import { seed } from "../../data/objections";
import { useEffect, useState } from "react";
import {
  createDemoRepository,
  initialState,
} from "../../api/objectionsRepository";
import type { Action, DemoState, Role, Route } from "../../types";
import { applyAction } from "./services/workflow";
import { pathForRoute, routeFromPath } from "./routing";

export function useObjectionsModel() {
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [role, setRole] = useState<Role>("work");
  const [route, setRoute] = useState<Route>(() =>
    routeFromPath(window.location.pathname),
  );
  const [loaded] = useState(() => {
    try {
      return { state: createDemoRepository(localStorage).load(), error: "" };
    } catch {
      return {
        state: initialState(),
        error:
          "Не удалось прочитать сохранённые данные. Показаны исходные тестовые обращения. Изменения будут сохранены при следующем действии, если браузер разрешает хранение.",
      };
    }
  });
  const [state, setState] = useState(() => {
    loaded.state = { ...loaded.state, cases: loaded.state.cases.map(c => ["ВОЗ-2026-001", "ВОЗ-2026-002", "ЖАЛ-2026-003"].includes(c.id) ? { ...c, org:c.org.replace(" — Демо", ""), applicant:c.applicant.replace(" (демо)", ""), address:c.address.replace(", демонстрационный адрес", "") } : c) };
    if (loaded.state.cases.some(c => c.id === "ВОЗ-2026-004")) return loaded.state;
    const prepared = { ...seed().find(c => c.id === "ВОЗ-2026-002")!, id: "ВОЗ-2026-004" };
    return { ...loaded.state, cases: [prepared, ...loaded.state.cases] };
  });
  useEffect(() => {
    const handler = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(next: Route) {
    window.history.pushState(null, "", pathForRoute(next));
    setRoute(next);
  }
  function commit(next: DemoState, message: string) {
    createDemoRepository(localStorage).save(next);
    setState(next);
    setError("");
    setToast(message);
  }
  function perform(caseId: string, action: Action, form: FormData) {
    commit(
      applyAction(state, caseId, action, role, form),
      "Действие сохранено",
    );
  }
  return {
    state,
    role,
    setRole,
    route,
    navigate,
    perform,
    commit,
    error: error || loaded.error,
    setError,
    toast,
    setToast,
  };
}

import type { ReactNode } from "react";
import { useDemoSession } from "../auth/useDemoSession";
import { DEMO_USER, MAIN_MENU_URL } from "../config";
import { ROLES } from "../data/constants";
import type {
  CommissionAttendanceMember,
  Page,
  Role,
  Route,
} from "../types";
import { formatDate } from "../utils/dateFormat";
import SaqSidebar from "./SaqSidebar";
import { Button } from "./ui";
import "./AppShell.css";

const navigation: { page: Page; label: string }[] = [
  { page: "registry", label: "Реестр возражений" },
  { page: "sessions", label: "Заседания комиссии" },
  { page: "notifications", label: "Уведомления" },
  { page: "recommendations", label: "Рекомендации" },
  { page: "processes", label: "Бизнес-процессы" },
];

function isAuthorityRole(role: Role) {
  return role === "dvga" || role === "kvga";
}

export default function AppShell({
  children,
  route,
  date,
  role,
  unreadNotifications,
  onRoleChange,
  onNavigate,
  onClock,
  activeCommissionMember,
  commissionMembers,
  onCommissionMemberChange,
}: {
  children: ReactNode;
  route: Route;
  date: string;
  role: Role;
  unreadNotifications: number;
  onRoleChange: (role: Role) => void;
  onNavigate: (route: Route) => void;
  onClock: () => void;
  onReset: () => void;
  activeCommissionMember?: CommissionAttendanceMember;
  commissionMembers?: CommissionAttendanceMember[];
  onCommissionMemberChange?: (memberId: string) => void;
}) {
  const session = useDemoSession();
  const home = () => onNavigate({ page: "registry" });

  if (session.signedOut) {
    return (
      <main className="saq-demo-exit">
        <section>
          <img
            src="/saq-logo.png?v=20260909-audit"
            alt="SAQ"
            width="72"
            height="56"
          />
          <h1>Вы вышли из модуля «Возражения»</h1>
          <p>Результаты рассмотрения сохранены.</p>
          <div>
            <Button
              primary
              onClick={() => {
                onRoleChange("work");
                home();
                session.login();
              }}
            >
              Войти в модуль
            </Button>
            <a className="saq-header-action" href={MAIN_MENU_URL}>
              Главное меню
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell objections-shell">
      <SaqSidebar
        onHome={home}
        items={navigation
          .filter(
            ({ page }) => !(isAuthorityRole(role) && page === "sessions"),
          )
          .map(({ page, label }) => ({
          page,
          label,
          badge: page === "notifications" ? unreadNotifications : undefined,
          active:
            route.page === page ||
            (route.page === "detail" && page === "registry"),
          onClick: () => onNavigate({ page }),
          }))}
      />
      <header className="topbar saq-topbar">
        <div className="topbar-title">
          <div>
            <h1>Возражения</h1>
            <p>Департамент внутреннего государственного аудита</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="language">RU</span>
          <div className="saq-user">
            <span>
              {DEMO_USER.fullName}
              <small>{DEMO_USER.position}</small>
            </span>
            <strong aria-hidden="true">{DEMO_USER.initials}</strong>
          </div>
          <a className="saq-header-action" href={MAIN_MENU_URL}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="2" width="4" height="4" rx=".5" />
              <rect x="10" y="2" width="4" height="4" rx=".5" />
              <rect x="2" y="10" width="4" height="4" rx=".5" />
              <rect x="10" y="10" width="4" height="4" rx=".5" />
            </svg>
            Главное меню
          </a>
          <button
            type="button"
            className="saq-header-action"
            onClick={session.logout}
          >
            Выйти
          </button>
        </div>
      </header>
      <main className="content">
        <div className="demo-bar saq-demo-bar">
          <div className="saq-demo-controls">
            <label className="role-control">
              <span>Исполнитель</span>
              <select
                value={role}
                onChange={(event) => onRoleChange(event.target.value as Role)}
              >
                {Object.entries(ROLES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="date-control"
              onClick={onClock}
              title="Изменить дату учёта для тестирования"
            >
              Дата учёта: {formatDate(date)}
            </button>
            {role === "commission" &&
              activeCommissionMember &&
              commissionMembers &&
              onCommissionMemberChange && (
                <label className="commission-member-control">
                  <span>Член АК</span>
                  <select
                    value={activeCommissionMember.id}
                    onChange={(event) =>
                      onCommissionMemberChange(event.target.value)
                    }
                  >
                    {commissionMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

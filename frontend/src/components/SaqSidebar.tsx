import { useState } from "react";
import type { Page } from "../types";
import { Icon } from "./ui";

const SIDEBAR_STORAGE_KEY = "saq.objections.sidebar.collapsed.v1";

export type SaqNavigationItem = {
  page: Page;
  label: string;
  active: boolean;
  onClick: () => void;
};

export default function SaqSidebar({
  items,
  onHome,
}: {
  items: SaqNavigationItem[];
  onHome: () => void;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  function toggleSidebar() {
    const next = !collapsed;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      /* A stored preference is optional. */
    }
    setCollapsed(next);
  }

  return (
    <aside className={`saq-sidebar ${collapsed ? "collapsed" : "expanded"}`}>
      <div className="saq-brand-row">
        <button
          className="saq-brand"
          type="button"
          onClick={onHome}
          aria-label="Главная страница модуля «Возражения»"
        >
          <img
            src="/saq-logo.png?v=20260909-audit"
            alt="Логотип SAQ"
            width="56"
            height="44"
            draggable={false}
          />
          <span>
            <strong>SAQ</strong>
            <small>Система государственного аудита</small>
          </span>
        </button>
        <button
          type="button"
          className="saq-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-expanded={!collapsed}
          aria-controls="saq-navigation"
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
        </button>
      </div>
      <nav
        id="saq-navigation"
        className="saq-navigation"
        aria-label="Навигация SAQ"
      >
        <p className="saq-navigation-caption">Модули системы</p>
        <section className="saq-module-group active">
          <button
            type="button"
            className="saq-module-button"
            onClick={onHome}
            title="Возражения"
          >
            <span className="saq-module-mark" aria-hidden="true">
              ВОЗ
            </span>
            <span>Возражения</span>
          </button>
          <div className="saq-module-menu">
            {items.map((item) => (
              <button
                type="button"
                key={item.page}
                className={item.active ? "active" : ""}
                onClick={item.onClick}
                aria-current={item.active ? "page" : undefined}
                title={item.label}
              >
                <Icon name={item.page} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      </nav>
      <p className="saq-sidebar-version">SAQ</p>
    </aside>
  );
}


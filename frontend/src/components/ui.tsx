import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  primary = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`button ${primary ? "primary" : ""} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}

export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

export function Notice({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: "" | "amber" | "green";
}) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`saq-dialog ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-head">
        <h3>{title}</h3>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    registry: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    sessions: (
      <>
        <path d="M5 7h14v14H5zM8 3v6M16 3v6M5 12h14M9 16h2M14 16h2" />
      </>
    ),
    processes: (
      <>
        <rect x="8" y="2" width="8" height="5" rx="1" />
        <path d="M12 7v5M5 12h14M5 12v5M19 12v5" />
        <rect x="2" y="17" width="6" height="5" rx="1" />
        <rect x="16" y="17" width="6" height="5" rx="1" />
      </>
    ),
    sources: (
      <>
        <path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.registry}
    </svg>
  );
}

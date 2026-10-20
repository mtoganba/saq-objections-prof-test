import { useState } from "react";

const SESSION_KEY = "saq.objections.demo.signed-out";

// Demo identity only; production authentication belongs to the backend session API.
export function useDemoSession() {
  const [signedOut, setSignedOut] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });

  function updateSession(next: boolean) {
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, "true");
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // The demo remains usable when browser storage is unavailable.
    }
    setSignedOut(next);
  }

  return {
    signedOut,
    login: () => updateSession(false),
    logout: () => updateSession(true),
  };
}

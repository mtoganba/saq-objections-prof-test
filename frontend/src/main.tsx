import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/cyrillic-400.css";
import "@fontsource/roboto/cyrillic-500.css";
import "@fontsource/roboto/cyrillic-700.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "./styles.css";
import "./components.css";
import ObjectionsModule from "./modules/objections/ObjectionsModule";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ObjectionsModule />
  </React.StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeOverlay } from "./App";
import { SellerConsole } from "./SellerConsole";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

const params = new URLSearchParams(window.location.search);
const viteEnv = import.meta as ImportMeta & {
  env?: {
    VITE_RUNTIME_ORIGIN?: string;
  };
};
const runtimeOrigin =
  params.get("runtimeOrigin") ??
  viteEnv.env?.VITE_RUNTIME_ORIGIN ??
  "http://127.0.0.1:8787";
const sessionId = params.get("sessionId") ?? undefined;
const mode = params.get("mode");

createRoot(root).render(
  <StrictMode>
    {mode === "seller" ? (
      <SellerConsole runtimeOrigin={runtimeOrigin} sessionId={sessionId} />
    ) : (
      <RuntimeOverlay runtimeOrigin={runtimeOrigin} sessionId={sessionId} />
    )}
  </StrictMode>
);

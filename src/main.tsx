import "./lib/demo/install";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupServiceWorker } from "@/lib/pwa";
import { isDemoMode } from "@/lib/demo/demoMode";

createRoot(document.getElementById("root")!).render(<App />);
if (!isDemoMode()) void setupServiceWorker();

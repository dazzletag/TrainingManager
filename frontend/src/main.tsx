import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, CssBaseline } from "@mui/material";
import App from "./App.tsx";
import { UserProvider } from "./context/UserContext";
import { theme } from "./theme";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";
import { msalInstance } from "./auth/msalInstance";

const queryClient = new QueryClient();

async function bootstrap() {
  await msalInstance.initialize();

  createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <UserProvider>
              <App />
            </UserProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </React.StrictMode>,
  );
}

bootstrap().catch((error) => {
  console.error("Failed to initialize MSAL", error);
});

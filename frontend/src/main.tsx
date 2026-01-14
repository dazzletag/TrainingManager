import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, CssBaseline } from "@mui/material";
import App from "./App.tsx";
import { UserProvider } from "./context/UserContext";
import { theme } from "./theme";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <UserProvider>
          <App />
        </UserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

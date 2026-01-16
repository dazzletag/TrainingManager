import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import StaffPage from "./pages/StaffPage";
import ManagerPage from "./pages/ManagerPage";
import AdminPage from "./pages/AdminPage";
import ReportingPage from "./pages/ReportingPage";
import { Box, Button, Paper, Typography } from "@mui/material";
import { useAuth } from "./auth/AuthContext";

function App() {
  const { isAuthenticated, login } = useAuth();

  if (!isAuthenticated) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f6f8fb 0%, #eef3f7 100%)",
          p: 3,
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 420, textAlign: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            Training Manager
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Sign in with your Bristol Care Homes account to continue.
          </Typography>
          <Button
            variant="contained"
            onClick={login}
          >
            Sign in
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/staff" replace />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="manager" element={<ManagerPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="admin/reporting" element={<ReportingPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

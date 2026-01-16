import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import StaffPage from "./pages/StaffPage";
import ManagerPage from "./pages/ManagerPage";
import AdminPage from "./pages/AdminPage";
import ReportingPage from "./pages/ReportingPage";

function App() {
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

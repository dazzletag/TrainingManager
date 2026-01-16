import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { fetchReportingCompliance, fetchReportingForecast, fetchReportingSummary, fetchReportingUtilisation } from "../services/reportingApi";
import { useUserContext } from "../context/UserContext";
import React from "react";

const ReactECharts = React.lazy(() => import("echarts-for-react"));

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Paper sx={{ p: 2, borderLeft: `6px solid ${accent ?? "#1e88e5"}` }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function ReportingPage() {
  const { role } = useUserContext();

  const summaryQuery = useQuery({
    queryKey: ["reportingSummary"],
    queryFn: () => fetchReportingSummary().then((response) => response.data),
  });

  const complianceQuery = useQuery({
    queryKey: ["reportingCompliance"],
    queryFn: () => fetchReportingCompliance().then((response) => response.data),
  });

  const forecastQuery = useQuery({
    queryKey: ["reportingForecast"],
    queryFn: () => fetchReportingForecast().then((response) => response.data),
  });

  const utilisationQuery = useQuery({
    queryKey: ["reportingUtilisation"],
    queryFn: () => fetchReportingUtilisation().then((response) => response.data),
  });

  if (role !== "admin") {
    return (
      <Alert severity="warning">
        Reporting & Insights is restricted to admin users.
      </Alert>
    );
  }

  const summary = summaryQuery.data;
  const compliance = complianceQuery.data;
  const forecast = forecastQuery.data;
  const utilisation = utilisationQuery.data;

  const heatmap = useMemo(() => {
    const homes = (summary?.ragByHome ?? []).map((item: any) => item.home);
    const values = (summary?.ragByHome ?? []).map((item: any) => ({
      name: item.home,
      value: [item.home, item.complianceRate],
    }));
    return { homes, values };
  }, [summary]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Reporting & Insights
        </Typography>
        <Typography color="text.secondary">
          Audit-ready compliance intelligence with live operational signals.
        </Typography>
      </Box>

      {(summaryQuery.isLoading || complianceQuery.isLoading) && (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Skeleton height={40} width="40%" />
            <Skeleton height={24} width="70%" />
            <Skeleton height={220} />
          </Stack>
        </Paper>
      )}

      {(summaryQuery.error || complianceQuery.error || forecastQuery.error || utilisationQuery.error) && (
        <Alert severity="error">
          Unable to load reporting data. Check the reporting API.
        </Alert>
      )}

      {summary && (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" },
          }}
        >
          <KpiCard label="Compliance (Mandatory)" value={`${summary.complianceRate}%`} accent="#1b5e20" />
          <KpiCard label="Overdue" value={String(summary.totals.overdue ?? 0)} accent="#b71c1c" />
          <KpiCard label="Due in 30 Days" value={String(summary.totals.due30 ?? 0)} accent="#f57c00" />
          <KpiCard label="Avg Days Late" value={String(summary.totals.avgDaysLate ?? 0)} accent="#6a1b9a" />
        </Box>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" },
        }}
      >
        <ChartCard title="Risk Heatmap by Home">
          <Suspense fallback={<Skeleton height={260} />}>
            <ReactECharts
              style={{ height: 260 }}
              option={{
                animationDuration: 900,
                visualMap: {
                  min: 60,
                  max: 100,
                  orient: "horizontal",
                  left: "center",
                  textStyle: { color: "#5f6b7a" },
                },
                grid: { top: 40, left: 0, right: 10, bottom: 40, containLabel: true },
                xAxis: { type: "category", data: heatmap.homes, axisLabel: { rotate: 20 } },
                yAxis: { type: "category", data: ["Compliance %"] },
                series: [
                  {
                    type: "heatmap",
                    data: heatmap.values.map((item: any) => [item.name, "Compliance %", item.value[1]]),
                    label: { show: true, color: "#1a1a1a" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard title="At-Risk Homes (Next 30 Days)">
          <Suspense fallback={<Skeleton height={260} />}>
            <ReactECharts
              style={{ height: 260 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 20, containLabel: true },
                xAxis: { type: "value" },
                yAxis: {
                  type: "category",
                  data: (summary?.ragByHome ?? []).map((item: any) => item.home).slice(0, 6),
                },
                series: [
                  {
                    type: "bar",
                    data: (summary?.ragByHome ?? [])
                      .map((item: any) => item.atRisk)
                      .slice(0, 6),
                    itemStyle: { color: "#ef6c00" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <ChartCard title="90-Day Forecast (Due + Overdue)">
          <Suspense fallback={<Skeleton height={240} />}>
            <ReactECharts
              style={{ height: 240 }}
              option={{
                animationDuration: 900,
                tooltip: { trigger: "axis" },
                xAxis: {
                  type: "category",
                  data: (forecast?.byMonth ?? []).map((item: any) =>
                    new Date(item.dueMonth).toLocaleDateString("en-GB", { month: "short" }),
                  ),
                },
                yAxis: { type: "value" },
                series: [
                  {
                    name: "Due",
                    type: "line",
                    smooth: true,
                    areaStyle: {},
                    data: (forecast?.byMonth ?? []).map((item: any) => item.dueCount),
                    itemStyle: { color: "#4b7bec" },
                  },
                  {
                    name: "Overdue",
                    type: "line",
                    smooth: true,
                    areaStyle: {},
                    data: (forecast?.byMonth ?? []).map((item: any) => item.overdueCount),
                    itemStyle: { color: "#d64541" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard title="Completion Velocity (Monthly)">
          <Suspense fallback={<Skeleton height={240} />}>
            <ReactECharts
              style={{ height: 240 }}
              option={{
                animationDuration: 900,
                xAxis: {
                  type: "category",
                  data: (summary?.velocity ?? []).map((item: any) =>
                    new Date(item.completedMonth).toLocaleDateString("en-GB", { month: "short" }),
                  ),
                },
                yAxis: { type: "value" },
                series: [
                  {
                    type: "line",
                    smooth: true,
                    data: (summary?.velocity ?? []).map((item: any) => item.completionCount),
                    itemStyle: { color: "#2ecc71" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <ChartCard title="Bottleneck Courses">
          <Suspense fallback={<Skeleton height={260} />}>
            <ReactECharts
              style={{ height: 260 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 40, containLabel: true },
                xAxis: { type: "value" },
                yAxis: {
                  type: "category",
                  data: (summary?.bottlenecks ?? []).map((item: any) => item.requirementName),
                },
                series: [
                  {
                    type: "bar",
                    data: (summary?.bottlenecks ?? []).map((item: any) => item.overdueCount),
                    itemStyle: { color: "#c0392b" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard title="Attendance Utilisation">
          <Suspense fallback={<Skeleton height={260} />}>
            <ReactECharts
              style={{ height: 260 }}
              option={{
                animationDuration: 900,
                tooltip: { trigger: "axis" },
                xAxis: {
                  type: "category",
                  data: (utilisation?.sessions ?? []).slice(0, 8).map((session: any) =>
                    new Date(session.sessionDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
                  ),
                },
                yAxis: { type: "value", max: 100 },
                series: [
                  {
                    type: "bar",
                    data: (utilisation?.sessions ?? []).slice(0, 8).map((session: any) => session.utilisationPct),
                    itemStyle: { color: "#2980b9" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <ChartCard title="Training Distribution by Home">
          <Suspense fallback={<Skeleton height={240} />}>
            <ReactECharts
              style={{ height: 240 }}
              option={{
                animationDuration: 900,
                tooltip: { trigger: "item" },
                series: [
                  {
                    type: "pie",
                    radius: ["45%", "70%"],
                    data: (summary?.distributionByHome ?? []).map((item: any) => ({
                      name: item.home,
                      value: item.totalPeople,
                    })),
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard title="Training Distribution by Role Type">
          <Suspense fallback={<Skeleton height={240} />}>
            <ReactECharts
              style={{ height: 240 }}
              option={{
                animationDuration: 900,
                tooltip: { trigger: "item" },
                series: [
                  {
                    type: "pie",
                    radius: ["45%", "70%"],
                    data: (summary?.distributionByRole ?? []).map((item: any) => ({
                      name: item.roleType ?? "Unknown",
                      value: item.totalPeople,
                    })),
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <ChartCard title="Repeat Attendance Imbalance">
          <Suspense fallback={<Skeleton height={220} />}>
            <ReactECharts
              style={{ height: 220 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 20, containLabel: true },
                xAxis: { type: "value" },
                yAxis: {
                  type: "category",
                  data: (summary?.repeatAttendance ?? []).map((item: any) => item.personName),
                },
                series: [
                  {
                    type: "bar",
                    data: (summary?.repeatAttendance ?? []).map((item: any) => item.completions),
                    itemStyle: { color: "#7f8c8d" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard title="Compliance by Role">
          <Suspense fallback={<Skeleton height={220} />}>
            <ReactECharts
              style={{ height: 220 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 20, containLabel: true },
                xAxis: { type: "category", data: (compliance?.byRole ?? []).map((item: any) => item.roleName) },
                yAxis: { type: "value", max: 100 },
                series: [
                  {
                    type: "bar",
                    data: (compliance?.byRole ?? []).map((item: any) => {
                      const total = Number(item.total ?? 0);
                      const compliant = Number(item.compliant ?? 0);
                      return total ? Math.round((compliant / total) * 100) : 0;
                    }),
                    itemStyle: { color: "#27ae60" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
      </Box>
    </Stack>
  );
}

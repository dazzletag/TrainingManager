import { Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { fetchReportingCompliance, fetchReportingForecast, fetchReportingMatrix, fetchReportingSummary, fetchReportingUtilisation } from "../services/reportingApi";
import type { ReportingFilters } from "../services/reportingApi";
import { useUserContext } from "../context/UserContext";
import React from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

const ReactECharts = React.lazy(() => import("echarts-for-react"));

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {description && (
          <Tooltip title={description}>
            <IconButton size="small" sx={{ color: "text.secondary" }}>
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {children}
    </Paper>
  );
}

function KpiCard({
  label,
  value,
  accent,
  description,
}: {
  label: string;
  value: string;
  accent?: string;
  description?: string;
}) {
  return (
    <Paper sx={{ p: 2, borderLeft: `6px solid ${accent ?? "#1e88e5"}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        {description && (
          <Tooltip title={description}>
            <InfoOutlinedIcon sx={{ fontSize: 14, color: "text.secondary" }} />
          </Tooltip>
        )}
      </Box>
      <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function ReportingPage() {
  const { role } = useUserContext();
  const [homeFilter, setHomeFilter] = useState("all");
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [importanceFilters, setImportanceFilters] = useState<string[]>([]);
  const [courseKeywordFilters, setCourseKeywordFilters] = useState<string[]>([]);
  const [showPercentages, setShowPercentages] = useState(false);

  const filters = useMemo<ReportingFilters>(() => {
    return {
      home: homeFilter !== "all" ? homeFilter : undefined,
      roles: roleFilters.length ? roleFilters : undefined,
      importance: importanceFilters.length ? importanceFilters : undefined,
      courseKeywords: courseKeywordFilters.length ? courseKeywordFilters : undefined,
    };
  }, [homeFilter, roleFilters, importanceFilters, courseKeywordFilters]);

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

  const matrixQuery = useQuery({
    queryKey: ["reportingMatrix", filters],
    queryFn: () => fetchReportingMatrix(filters).then((response) => response.data),
  });

  const summary = summaryQuery.data;
  const compliance = complianceQuery.data;
  const forecast = forecastQuery.data;
  const utilisation = utilisationQuery.data;
  const matrix = matrixQuery.data;

  const availableHomes = compliance?.meta?.homes ?? (compliance?.byHome ?? []).map((item: any) => item.home);
  const availableRoles = compliance?.meta?.roles ?? (compliance?.byRole ?? []).map((item: any) => item.roleName);
  const availableImportance = compliance?.meta?.importanceLevels ?? [];
  const homeOptions = useMemo<string[]>(
    () =>
      Array.from(new Set(availableHomes))
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    [availableHomes],
  );
  const roleOptions = useMemo<string[]>(
    () =>
      Array.from(new Set(availableRoles))
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    [availableRoles],
  );
  const importanceOptions = useMemo<string[]>(
    () =>
      Array.from(new Set(availableImportance))
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    [availableImportance],
  );
  const courseKeywordLabels: Record<string, string> = {
    sctv: "SCTV",
    competency: "Competency",
  };

  const totalAssignments = Number(summary?.totals?.assignments ?? 0);
  const toPercent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);
  const formatValue = (value: number, total?: number) => {
    if (!showPercentages) return String(value);
    const percent = total !== undefined ? toPercent(value, total) : value;
    return `${percent}%`;
  };
  const activeHome = filters.home;
  const activeRoles = filters.roles ?? [];
  const activeImportance = filters.importance ?? [];
  const activeCourseKeywords = filters.courseKeywords ?? [];

  const matchesCourseKeyword = (name: string) => {
    if (!activeCourseKeywords.length) return true;
    const upperName = name.toUpperCase();
    const wantsSctv = activeCourseKeywords.includes("sctv");
    const wantsCompetency = activeCourseKeywords.includes("competency");
    return (
      (wantsSctv && upperName.includes("SCTV")) ||
      (wantsCompetency && upperName.includes("COMPETENCY"))
    );
  };

  const matchesImportance = (level?: string | null) => {
    if (!activeImportance.length) return true;
    if (!level) return false;
    return activeImportance.includes(level);
  };

  const filteredRagByHome = useMemo(() => {
    let data = summary?.ragByHome ?? [];
    if (activeHome) {
      data = data.filter((item: any) => item.home === activeHome);
    }
    return data;
  }, [summary, activeHome]);

  const filteredBottlenecks = useMemo(() => {
    let data = summary?.bottlenecks ?? [];
    data = data.filter((item: any) => matchesCourseKeyword(item.requirementName ?? ""));
    if (activeImportance.length) {
      data = data.filter((item: any) => matchesImportance(item.requiredLevel));
    }
    return data;
  }, [summary, activeCourseKeywords, activeImportance]);

  const filteredDistributionByHome = useMemo(() => {
    let data = summary?.distributionByHome ?? [];
    if (activeHome) {
      data = data.filter((item: any) => item.home === activeHome);
    }
    return data;
  }, [summary, activeHome]);

  const filteredDistributionByRole = useMemo(() => {
    const rows = compliance?.byRole ?? [];
    const filtered = activeRoles.length
      ? rows.filter((item: any) => activeRoles.includes(item.roleName))
      : rows;
    const totals = new Map<string, number>();
    filtered.forEach((item: any) => {
      const key = item.roleCategory ?? "Unknown";
      const current = totals.get(key) ?? 0;
      totals.set(key, current + Number(item.total ?? 0));
    });
    return Array.from(totals.entries()).map(([roleType, totalPeople]) => ({
      roleType,
      totalPeople,
    }));
  }, [compliance, activeRoles]);

  const filteredComplianceByRole = useMemo(() => {
    const rows = compliance?.byRole ?? [];
    return activeRoles.length
      ? rows.filter((item: any) => activeRoles.includes(item.roleName))
      : rows;
  }, [compliance, activeRoles]);

  const filteredRepeatAttendance = useMemo(() => {
    let data = summary?.repeatAttendance ?? [];
    if (activeHome) {
      data = data.filter((item: any) => item.home === activeHome);
    }
    return data;
  }, [summary, activeHome]);

  const homeRiskValues = filteredRagByHome.map((item: any) => {
    const atRisk = Number(item.atRisk ?? 0);
    const total = Number(item.total ?? 0);
    return showPercentages ? toPercent(atRisk, total) : atRisk;
  });
  const bottleneckValues = filteredBottlenecks.map((item: any) => {
    const overdue = Number(item.overdueCount ?? 0);
    const total = Number(item.total ?? 0);
    return showPercentages ? toPercent(overdue, total) : overdue;
  });
  const repeatTotal = filteredRepeatAttendance.reduce(
    (acc: number, item: any) => acc + Number(item.completions ?? 0),
    0,
  );
  const repeatValues = filteredRepeatAttendance.map((item: any) => {
    const completions = Number(item.completions ?? 0);
    return showPercentages ? toPercent(completions, repeatTotal) : completions;
  });
  const forecastSeries = useMemo(() => {
    const items = forecast?.byMonth ?? [];
    return items.map((item: any) => {
      const due = Number(item.dueCount ?? 0);
      const overdue = Number(item.overdueCount ?? 0);
      const total = due + overdue;
      return {
        dueMonth: item.dueMonth,
        dueValue: showPercentages ? toPercent(due, total) : due,
        overdueValue: showPercentages ? toPercent(overdue, total) : overdue,
      };
    });
  }, [forecast, showPercentages]);
  const velocityValues = useMemo(() => {
    const items = summary?.velocity ?? [];
    const maxValue = items.reduce((max: number, item: any) => Math.max(max, Number(item.completionCount ?? 0)), 0);
    return items.map((item: any) => {
      const value = Number(item.completionCount ?? 0);
      return showPercentages && maxValue ? Math.round((value / maxValue) * 100) : value;
    });
  }, [summary, showPercentages]);

  const heatmap = useMemo(() => {
    const homes = filteredRagByHome.map((item: any) => item.home);
    const values = filteredRagByHome.map((item: any) => ({
      name: item.home,
      value: [item.home, item.complianceRate],
    }));
    return { homes, values };
  }, [filteredRagByHome]);

  if (role !== "admin") {
    return (
      <Alert severity="warning">
        Reporting & Insights is restricted to admin users.
      </Alert>
    );
  }

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

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Filters
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" },
            }}
          >
            <FormControl size="small">
              <InputLabel>Care Home</InputLabel>
              <Select
                label="Care Home"
                value={homeFilter}
                onChange={(event) => setHomeFilter(event.target.value)}
              >
                <MenuItem value="all">All Homes</MenuItem>
                {homeOptions.map((home: string) => (
                  <MenuItem key={home} value={home}>
                    {home}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>Employee Group</InputLabel>
              <Select
                multiple
                label="Employee Group"
                value={roleFilters}
                onChange={(event) => setRoleFilters(event.target.value as string[])}
                renderValue={(selected) => (selected.length ? selected.join(", ") : "All groups")}
              >
                {roleOptions.map((role: string) => (
                  <MenuItem key={role} value={role}>
                    <Checkbox checked={roleFilters.indexOf(role) > -1} />
                    <ListItemText primary={role} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>Course Title</InputLabel>
              <Select
                multiple
                label="Course Title"
                value={courseKeywordFilters}
                onChange={(event) => setCourseKeywordFilters(event.target.value as string[])}
                renderValue={(selected) =>
                  selected.length
                    ? selected.map((item) => courseKeywordLabels[item] ?? item).join(", ")
                    : "All titles"
                }
              >
                <MenuItem value="sctv">
                  <Checkbox checked={courseKeywordFilters.includes("sctv")} />
                  <ListItemText primary="SCTV in title" />
                </MenuItem>
                <MenuItem value="competency">
                  <Checkbox checked={courseKeywordFilters.includes("competency")} />
                  <ListItemText primary="Competency in title" />
                </MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>Importance</InputLabel>
              <Select
                multiple
                label="Importance"
                value={importanceFilters}
                onChange={(event) => setImportanceFilters(event.target.value as string[])}
                renderValue={(selected) => (selected.length ? selected.join(", ") : "All levels")}
              >
                {importanceOptions.map((level: string) => (
                  <MenuItem key={level} value={level}>
                    <Checkbox checked={importanceFilters.indexOf(level) > -1} />
                    <ListItemText primary={level} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Divider />
          <FormControlLabel
            control={
              <Switch
                checked={showPercentages}
                onChange={(event) => setShowPercentages(event.target.checked)}
              />
            }
            label="Swap values to percentages"
          />
          <Typography variant="caption" color="text.secondary">
            Filters apply to breakdowns and rankings where source data supports the split.
          </Typography>
        </Stack>
      </Paper>

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
          <KpiCard
            label="Compliance (Essential)"
            value={`${summary.complianceRate}%`}
            accent="#1b5e20"
            description="Share of essential assignments currently compliant."
          />
          <KpiCard
            label="Overdue"
            value={formatValue(Number(summary.totals.overdue ?? 0), totalAssignments)}
            accent="#b71c1c"
            description="Essential assignments past their due date."
          />
          <KpiCard
            label="Due in 30 Days"
            value={formatValue(Number(summary.totals.due30 ?? 0), totalAssignments)}
            accent="#f57c00"
            description="Essential assignments due within the next 30 days."
          />
          <KpiCard
            label="Avg Days Late"
            value={String(summary.totals.avgDaysLate ?? 0)}
            accent="#6a1b9a"
            description="Average days overdue for essential training."
          />
        </Box>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" },
        }}
      >
        <ChartCard
          title="Risk Heatmap by Home"
          description="Shows essential compliance percentage by home. Use this to spot homes that are drifting below target."
        >
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
        <ChartCard
          title={`At-Risk Homes (Next 30 Days)${showPercentages ? " (%)" : ""}`}
          description="Staff due or overdue in the next 30 days. Switch to percentages to compare homes of different sizes."
        >
          <Suspense fallback={<Skeleton height={260} />}>
            <ReactECharts
              style={{ height: 260 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 20, containLabel: true },
                xAxis: { type: "value", max: showPercentages ? 100 : undefined },
                yAxis: {
                  type: "category",
                  data: filteredRagByHome.map((item: any) => item.home).slice(0, 6),
                },
                series: [
                  {
                    type: "bar",
                    data: homeRiskValues.slice(0, 6),
                    itemStyle: { color: "#ef6c00" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
      </Box>

      <ChartCard
        title="Essential SCTV Expiry Matrix"
        description="Rows show employees and columns show SCTV courses that are essential. Overdue essential items are highlighted."
      >
        {matrixQuery.isLoading && <Skeleton height={240} />}
        {matrixQuery.error && <Alert severity="error">Unable to load matrix report</Alert>}
        {matrix && (
          <TableContainer sx={{ maxHeight: 420 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      backgroundColor: "background.paper",
                    }}
                  >
                    Employee
                  </TableCell>
                  {matrix.courses.map((course: any) => (
                    <TableCell key={course.id} sx={{ minWidth: 160 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {course.name}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {matrix.employees.map((employee: any) => (
                  <TableRow key={employee.id}>
                    <TableCell
                      sx={{
                        position: "sticky",
                        left: 0,
                        backgroundColor: "background.paper",
                        zIndex: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {employee.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {employee.home} · {employee.role}
                      </Typography>
                    </TableCell>
                    {matrix.courses.map((course: any) => {
                      const entry = employee.courses?.[course.id];
                      const expiry = entry?.expiryDate ? new Date(entry.expiryDate) : null;
                      const isOverdue = entry?.complianceStatus === "overdue";
                      const isEssential = course.requiredLevel === 1;
                      const highlight = isEssential && isOverdue;
                      return (
                        <TableCell
                          key={course.id}
                          sx={{
                            bgcolor: highlight ? "rgba(211, 47, 47, 0.12)" : "transparent",
                            color: highlight ? "#b71c1c" : "inherit",
                            fontWeight: highlight ? 700 : 400,
                          }}
                        >
                          {expiry
                            ? expiry.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                            : "-"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </ChartCard>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <ChartCard
          title={`90-Day Forecast (Due + Overdue)${showPercentages ? " (%)" : ""}`}
          description="Shows upcoming due and overdue volume. Use this to schedule sessions ahead of expiry spikes."
        >
          <Suspense fallback={<Skeleton height={240} />}>
            <ReactECharts
              style={{ height: 240 }}
              option={{
                animationDuration: 900,
                tooltip: { trigger: "axis" },
                xAxis: {
                  type: "category",
                  data: forecastSeries.map((item: any) =>
                    new Date(item.dueMonth).toLocaleDateString("en-GB", { month: "short" }),
                  ),
                },
                yAxis: { type: "value", max: showPercentages ? 100 : undefined },
                series: [
                  {
                    name: "Due",
                    type: "line",
                    smooth: true,
                    areaStyle: {},
                    data: forecastSeries.map((item: any) => item.dueValue),
                    itemStyle: { color: "#4b7bec" },
                  },
                  {
                    name: "Overdue",
                    type: "line",
                    smooth: true,
                    areaStyle: {},
                    data: forecastSeries.map((item: any) => item.overdueValue),
                    itemStyle: { color: "#d64541" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard
          title={`Completion Velocity (Monthly)${showPercentages ? " (%)" : ""}`}
          description="Monthly completion throughput. Switch to % to see momentum relative to the strongest month."
        >
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
                yAxis: { type: "value", max: showPercentages ? 100 : undefined },
                series: [
                  {
                    type: "line",
                    smooth: true,
                    data: velocityValues,
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
        <ChartCard
          title={`Bottleneck Courses${showPercentages ? " (%)" : ""}`}
          description="Courses creating the largest overdue backlog. Use this to target content or delivery improvements."
        >
          <Suspense fallback={<Skeleton height={260} />}>
            <ReactECharts
              style={{ height: 260 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 40, containLabel: true },
                xAxis: { type: "value", max: showPercentages ? 100 : undefined },
                yAxis: {
                  type: "category",
                  data: filteredBottlenecks.map((item: any) => item.requirementName),
                },
                series: [
                  {
                    type: "bar",
                    data: bottleneckValues,
                    itemStyle: { color: "#c0392b" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Attendance Utilisation"
          description="Session fill rate versus capacity. Aim to keep this above 80% for cost efficiency."
        >
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
        <ChartCard
          title="Training Distribution by Home"
          description="Share of staff with essential assignments by home. Use to validate balanced coverage."
        >
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
                    label: {
                      formatter: showPercentages ? "{b}: {d}%" : "{b}: {c}",
                    },
                    data: filteredDistributionByHome.map((item: any) => ({
                      name: item.home,
                      value: item.totalPeople,
                    })),
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Training Distribution by Role Type"
          description="Share of essential training coverage by role category (care vs ancillary)."
        >
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
                    label: {
                      formatter: showPercentages ? "{b}: {d}%" : "{b}: {c}",
                    },
                    data: filteredDistributionByRole.map((item: any) => ({
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
        <ChartCard
          title={`Repeat Attendance Imbalance${showPercentages ? " (%)" : ""}`}
          description="Highlights staff with repeated Mandatory Training completions to spot uneven attendance patterns."
        >
          <Suspense fallback={<Skeleton height={220} />}>
            <ReactECharts
              style={{ height: 220 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 20, containLabel: true },
                xAxis: { type: "value", max: showPercentages ? 100 : undefined },
                yAxis: {
                  type: "category",
                  data: filteredRepeatAttendance.map((item: any) => item.personName),
                },
                series: [
                  {
                    type: "bar",
                    data: repeatValues,
                    itemStyle: { color: "#7f8c8d" },
                  },
                ],
              }}
            />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Compliance by Employee Group"
          description="Essential compliance percentage by employee group. Use for targeted performance actions."
        >
          <Suspense fallback={<Skeleton height={220} />}>
            <ReactECharts
              style={{ height: 220 }}
              option={{
                animationDuration: 900,
                grid: { left: 10, right: 10, top: 20, bottom: 20, containLabel: true },
                xAxis: { type: "category", data: filteredComplianceByRole.map((item: any) => item.roleName) },
                yAxis: { type: "value", max: 100 },
                series: [
                  {
                    type: "bar",
                    data: filteredComplianceByRole.map((item: any) => {
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

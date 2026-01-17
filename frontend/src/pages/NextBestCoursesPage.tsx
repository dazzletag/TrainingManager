import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { fetchNextBestCourseEligible, fetchNextBestCourses } from "../services/api";
import { useUserContext } from "../context/UserContext";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import GroupsIcon from "@mui/icons-material/Groups";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

type Recommendation = {
  courseId: string;
  courseName: string;
  importanceLevel: number;
  eligibleCount: number;
  expiredCount: number;
  atRiskCount: number;
  averageDaysToExpiry: number | null;
  recommendationScore: number;
  rationale: string;
};

const urgencyScale = [
  { label: "Low", color: "success" as const, min: 0 },
  { label: "Medium", color: "warning" as const, min: 15 },
  { label: "High", color: "error" as const, min: 30 },
];

function getUrgency(score: number) {
  if (score >= urgencyScale[2].min) return urgencyScale[2];
  if (score >= urgencyScale[1].min) return urgencyScale[1];
  return urgencyScale[0];
}

function ImportanceDots({ level }: { level: number }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Box
          key={index}
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: index < level ? "#0f62fe" : "rgba(15, 98, 254, 0.15)",
          }}
        />
      ))}
    </Box>
  );
}

function NextBestCoursesPage() {
  const { role, userEmail } = useUserContext();
  const [selectedCourse, setSelectedCourse] = useState<Recommendation | null>(null);

  const recommendationsQuery = useQuery({
    queryKey: ["nextBestCourses", role],
    queryFn: () => fetchNextBestCourses(role, userEmail).then((response) => response.data),
  });

  const eligibleQuery = useQuery({
    queryKey: ["nextBestCourseEligible", role, selectedCourse?.courseId],
    queryFn: () =>
      fetchNextBestCourseEligible(selectedCourse!.courseId, role, userEmail).then((res) => res.data),
    enabled: Boolean(selectedCourse),
  });

  const totals = useMemo(() => {
    const list: Recommendation[] = recommendationsQuery.data?.recommendations ?? [];
    return {
      courses: list.length,
      expired: list.reduce((acc, item) => acc + item.expiredCount, 0),
      atRisk: list.reduce((acc, item) => acc + item.atRiskCount, 0),
    };
  }, [recommendationsQuery.data]);

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        p: { xs: 2, md: 3 },
        borderRadius: 3,
        background: "linear-gradient(135deg, rgba(15,98,254,0.08) 0%, rgba(255,140,0,0.12) 100%)",
        "&::before": {
          content: '""',
          position: "absolute",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "rgba(15,98,254,0.12)",
          top: -120,
          right: -80,
          zIndex: 0,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: "rgba(255,140,0,0.12)",
          bottom: -100,
          left: -60,
          zIndex: 0,
        },
      }}
    >
      <Stack spacing={3} sx={{ position: "relative", zIndex: 1 }}>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
          <Stack spacing={1}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Next Best Courses
            </Typography>
            <Typography color="text.secondary">
              Data-driven recommendations based on compliance risk, course criticality, and cohort size.
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
              <Paper sx={{ p: 2, flex: 1, borderRadius: 2, background: "rgba(15,98,254,0.08)" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Recommended courses
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {totals.courses}
                </Typography>
              </Paper>
              <Paper sx={{ p: 2, flex: 1, borderRadius: 2, background: "rgba(255,140,0,0.12)" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Staff at risk
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {totals.atRisk}
                </Typography>
              </Paper>
              <Paper sx={{ p: 2, flex: 1, borderRadius: 2, background: "rgba(244,67,54,0.12)" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Staff expired
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {totals.expired}
                </Typography>
              </Paper>
            </Stack>
          </Stack>
        </Paper>

        {recommendationsQuery.isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {recommendationsQuery.error && <Alert severity="error">Unable to load recommendations</Alert>}

        {recommendationsQuery.data?.recommendations?.length === 0 && (
          <Alert severity="info">No courses meet the recommendation thresholds right now.</Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          {(recommendationsQuery.data?.recommendations ?? []).map((course: Recommendation) => {
            const urgency = getUrgency(course.recommendationScore);
            return (
              <Paper
                key={course.courseId}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  border: "1px solid rgba(15,98,254,0.12)",
                  background: "rgba(255,255,255,0.92)",
                }}
              >
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {course.courseName}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Importance
                        </Typography>
                        <ImportanceDots level={course.importanceLevel} />
                      </Stack>
                    </Box>
                    <Chip
                      icon={<LocalFireDepartmentIcon />}
                      label={`${urgency.label} urgency`}
                      color={urgency.color}
                      variant="outlined"
                    />
                  </Stack>

                  <Divider />

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ReportProblemIcon color="error" fontSize="small" />
                        <Typography variant="body2">
                          {course.expiredCount} expired
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <WarningAmberIcon color="warning" fontSize="small" />
                        <Typography variant="body2">
                          {course.atRiskCount} at risk
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <GroupsIcon color="primary" fontSize="small" />
                        <Typography variant="body2">
                          {course.eligibleCount} eligible staff
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AccessTimeIcon color="action" fontSize="small" />
                        <Typography variant="body2">
                          Average {course.averageDaysToExpiry ?? "n/a"} days to expiry
                        </Typography>
                      </Stack>
                    </Stack>

                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Recommendation score
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {course.recommendationScore}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {course.rationale}
                      </Typography>
                      <Button variant="contained" onClick={() => setSelectedCourse(course)}>
                        View eligible staff
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Box>
      </Stack>

      <Dialog
        open={Boolean(selectedCourse)}
        onClose={() => setSelectedCourse(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {selectedCourse?.courseName ?? "Eligible staff"}
        </DialogTitle>
        <DialogContent>
          {eligibleQuery.isLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {eligibleQuery.error && <Alert severity="error">Unable to load eligible staff</Alert>}
          {(eligibleQuery.data?.eligible ?? []).length === 0 && (
            <Alert severity="info">No eligible staff are currently at risk.</Alert>
          )}
          <Stack spacing={2} sx={{ mt: 2 }}>
            {(eligibleQuery.data?.eligible ?? []).map((entry: any) => (
              <Paper key={entry.employeeId} sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)" }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {entry.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {entry.homeLocation}
                    </Typography>
                  </Box>
                  <Chip
                    label={entry.status === "Expired" ? "Expired" : "At Risk"}
                    color={entry.status === "Expired" ? "error" : "warning"}
                    variant="outlined"
                  />
                  <Typography variant="body2" sx={{ minWidth: 140, textAlign: { sm: "right" } }}>
                    {entry.daysToExpiry === null ? "No expiry date" : `${entry.daysToExpiry} days to expiry`}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default NextBestCoursesPage;

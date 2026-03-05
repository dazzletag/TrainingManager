import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { fetchManagerCompliance, fetchNextBestCourses } from "../services/api";
import { useUserContext } from "../context/UserContext";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TrainingSessionBuilder from "../components/TrainingSessionBuilder";

type HomeCompliance = {
  home: string;
  total: number;
  atRisk: number;
  missing: number;
  complianceRate: number;
};

function ManagerPage() {
  const { role, userEmail } = useUserContext();
  const [tab, setTab] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  const complianceQuery = useQuery({
    queryKey: ["managerCompliance", role],
    queryFn: () => fetchManagerCompliance(role, userEmail, "Mandatory Training").then((response) => response.data),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["nextBestCourses", role],
    queryFn: () => fetchNextBestCourses(role, userEmail).then((response) => response.data),
    enabled: tab === 1,
  });

  const recommendations: { courseId: string; courseName: string }[] = recommendationsQuery.data?.recommendations ?? [];
  const selectedCourse = recommendations.find((r) => r.courseId === selectedCourseId);

  const homeCompliance: HomeCompliance[] = (complianceQuery.data?.buckets ?? [])
    .reduce((acc: HomeCompliance[], bucket: any) => {
      const home = bucket.homeLocation ?? "Unknown";
      const existing = acc.find((item) => item.home === home);
      const totalPeople = Number(bucket.totalPeople ?? 0);
      const atRiskPeople = Number(bucket.atRiskPeople ?? 0);
      const missingPeople = Number(bucket.missingPeople ?? 0);
      if (existing) {
        existing.total += totalPeople;
        existing.atRisk += atRiskPeople;
        existing.missing += missingPeople;
      } else {
        acc.push({
          home,
          total: totalPeople,
          atRisk: atRiskPeople,
          missing: missingPeople,
          complianceRate: 0,
        });
      }
      return acc;
    }, [] as HomeCompliance[])
    .map((item: HomeCompliance) => ({
      ...item,
      complianceRate: item.total
        ? Math.round(((item.total - item.atRisk - item.missing) / item.total) * 100)
        : 0,
    }));

  return (
    <Stack spacing={3}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)}>
        <Tab label="Mandatory Training" />
        <Tab label="Next Best Course" />
      </Tabs>

      {tab === 0 && (
        <>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Compliance Overview</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {complianceQuery.isLoading && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                  <CircularProgress />
                </Box>
              )}
              {complianceQuery.error && <Alert severity="error">Unable to load compliance data</Alert>}
              {complianceQuery.data && (
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Home</TableCell>
                      <TableCell>Compliance Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {homeCompliance.map((bucket) => (
                      <TableRow key={bucket.home}>
                        <TableCell>{bucket.home}</TableCell>
                        <TableCell>{bucket.complianceRate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </AccordionDetails>
          </Accordion>

          <TrainingSessionBuilder />
        </>
      )}

      {tab === 1 && (
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6" gutterBottom>Plan a next best course session</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Select a course from the current recommendations, then use the planner below to schedule a session.
            </Typography>
            {recommendationsQuery.isLoading && <CircularProgress size={20} />}
            {recommendationsQuery.error && <Alert severity="error">Unable to load recommendations</Alert>}
            {recommendations.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 360, mt: 1 }}>
                <InputLabel>Select course</InputLabel>
                <Select
                  label="Select course"
                  value={selectedCourseId}
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                >
                  {recommendations.map((r) => (
                    <MenuItem key={r.courseId} value={r.courseId}>{r.courseName}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          {selectedCourse && (
            <TrainingSessionBuilder
              requirementId={selectedCourse.courseId}
              requirementName={selectedCourse.courseName}
            />
          )}
          {!selectedCourse && !recommendationsQuery.isLoading && recommendations.length === 0 && (
            <Alert severity="info">No courses currently meet the recommendation thresholds.</Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export default ManagerPage;

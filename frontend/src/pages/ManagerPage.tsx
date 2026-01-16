import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { fetchManagerCompliance } from "../services/api";
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

  const complianceQuery = useQuery({
    queryKey: ["managerCompliance", role],
    queryFn: () => fetchManagerCompliance(role, userEmail, "Mandatory Training").then((response) => response.data),
  });

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
    </Stack>
  );
}

export default ManagerPage;

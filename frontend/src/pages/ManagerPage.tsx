import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import { fetchManagerAtRisk, fetchManagerCompliance } from "../services/api";
import { useUserContext } from "../context/UserContext";
import TrainingSessionBuilder from "../components/TrainingSessionBuilder";

function ManagerPage() {
  const { role, userEmail } = useUserContext();

  const complianceQuery = useQuery({
    queryKey: ["managerCompliance", role],
    queryFn: () => fetchManagerCompliance(role, userEmail).then((response) => response.data),
  });

  const atRiskQuery = useQuery({
    queryKey: ["managerAtRisk", role],
    queryFn: () => fetchManagerAtRisk(role, userEmail).then((response) => response.data),
  });

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Compliance Overview</Typography>
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
                <TableCell>Role</TableCell>
                <TableCell>People</TableCell>
                <TableCell>Compliance Rate</TableCell>
                <TableCell>At Risk</TableCell>
                <TableCell>Missing</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {complianceQuery.data.buckets.map((bucket: any) => (
                <TableRow key={`${bucket.homeLocation}-${bucket.role}`}>
                  <TableCell>{bucket.homeLocation}</TableCell>
                  <TableCell>{bucket.role}</TableCell>
                  <TableCell>{bucket.totalPeople}</TableCell>
                  <TableCell>{bucket.complianceRate}%</TableCell>
                  <TableCell>{bucket.atRiskPeople}</TableCell>
                  <TableCell>{bucket.missingPeople}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">At-Risk Staff</Typography>
        {atRiskQuery.isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <CircularProgress />
          </Box>
        )}
        {atRiskQuery.error && <Alert severity="error">Unable to load at-risk data</Alert>}
        {atRiskQuery.data && (
          <List dense>
            {atRiskQuery.data.atRisk.map((entry: any) => (
              <ListItem key={entry.person.id} alignItems="flex-start">
                <ListItemText
                  primary={`${entry.person.name} · ${entry.person.role}`}
                  secondary={entry.requirements
                    .map(
                      (req: any) =>
                        `${req.requirement.name} (${req.status})${req.expiry ? ` - expires ${new Date(
                          req.expiry,
                        ).toLocaleDateString()}` : ""}`,
                    )
                    .join("; ")}
                />
              </ListItem>
            ))}
            {!atRiskQuery.data.atRisk.length && (
              <ListItem>
                <ListItemText primary="No staff currently flagged as at-risk" />
              </ListItem>
            )}
          </List>
        )}
      </Paper>

      <TrainingSessionBuilder />
    </Stack>
  );
}

export default ManagerPage;

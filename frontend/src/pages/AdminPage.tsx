import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { fetchTrainingRequirements, createTrainingRequirement, fetchRoles, fetchAuditTrail, fetchManagerAtRisk, approveEvidence } from "../services/api";
import { useUserContext } from "../context/UserContext";
import { useState } from "react";

function AdminPage() {
  const { role, userEmail } = useUserContext();
  const [tabIndex, setTabIndex] = useState(0);
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    validityPeriodMonths: 12,
    mandatory: true,
    roleExternalIds: [] as string[],
  });

  const trainingRequirementsQuery = useQuery({
    queryKey: ["adminTrainingRequirements", role],
    queryFn: () => fetchTrainingRequirements(role, userEmail).then((response) => response.data),
  });

  const rolesQuery = useQuery({
    queryKey: ["adminRoles", role],
    queryFn: () => fetchRoles(role, userEmail).then((response) => response.data),
  });

  const auditQuery = useQuery({
    queryKey: ["adminAudit", role],
    queryFn: () => fetchAuditTrail(role, userEmail).then((response) => response.data),
  });

  const atRiskQuery = useQuery({
    queryKey: ["adminAtRisk", role],
    queryFn: () => fetchManagerAtRisk(role, userEmail).then((response) => response.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => createTrainingRequirement(payload, role, userEmail),
    onSuccess: () => trainingRequirementsQuery.refetch(),
  });

  const approveMutation = useMutation({
    mutationFn: (evidenceId: string) => approveEvidence(evidenceId, { approvedBy: userEmail, confidenceOverride: 100 }, role, userEmail),
  });

  const handleRoleSelection = (event: SelectChangeEvent<typeof formValues.roleExternalIds>) => {
    const { value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      roleExternalIds: typeof value === "string" ? value.split(",") : value,
    }));
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6">Admin Workspace</Typography>
      <Tabs value={tabIndex} onChange={(_, value) => setTabIndex(value)} sx={{ mt: 2 }}>
        <Tab label="Requirements" />
        <Tab label="Evidence Overrides" />
        <Tab label="Audit Trail" />
      </Tabs>

      {tabIndex === 0 && (
        <Box mt={2}>
          <Typography variant="subtitle1">Defined Requirements</Typography>
          {trainingRequirementsQuery.isLoading && <CircularProgress size={24} />}
          {trainingRequirementsQuery.data && (
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Validity (months)</TableCell>
                  <TableCell>Mandatory</TableCell>
                  <TableCell>Roles</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trainingRequirementsQuery.data.requirements.map((requirement: any) => (
                  <TableRow key={requirement.id}>
                    <TableCell>{requirement.name}</TableCell>
                    <TableCell>{requirement.validityPeriodMonths}</TableCell>
                    <TableCell>{requirement.mandatory ? "Yes" : "No"}</TableCell>
                    <TableCell>{requirement.roles.map((role: any) => role.name).join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Box mt={3} component="form" autoComplete="off">
            <Typography variant="subtitle1" gutterBottom>
              Define new requirement
            </Typography>
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                mt: 1,
              }}
            >
              <TextField
                label="Name"
                fullWidth
                size="small"
                value={formValues.name}
                onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
              />
              <TextField
                label="Validity (months)"
                fullWidth
                size="small"
                type="number"
                value={formValues.validityPeriodMonths}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, validityPeriodMonths: Number(event.target.value) }))
                }
              />
              <TextField
                label="Description"
                multiline
                rows={3}
                fullWidth
                size="small"
                sx={{ gridColumn: "1 / -1" }}
                value={formValues.description}
                onChange={(event) => setFormValues((prev) => ({ ...prev, description: event.target.value }))}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formValues.mandatory}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, mandatory: event.target.checked }))}
                  />
                }
                label="Mandatory"
              />
              <FormControl fullWidth size="small">
                <Select
                  multiple
                  displayEmpty
                  value={formValues.roleExternalIds}
                  onChange={handleRoleSelection}
                  renderValue={(selected) =>
                    selected.length ? selected.join(", ") : "Select roles (from Planday sync results)"
                  }
                >
                  {rolesQuery.data?.roles.map((roleOption: any) => (
                    <MenuItem key={roleOption.id} value={roleOption.externalId}>
                      {roleOption.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Button
                  variant="contained"
                  disabled={createMutation.status === "pending"}
                  onClick={() => {
                    createMutation.mutate({
                      name: formValues.name,
                      description: formValues.description,
                      validityPeriodMonths: formValues.validityPeriodMonths,
                      mandatory: formValues.mandatory,
                      roleExternalIds: formValues.roleExternalIds,
                    });
                  }}
                >
                  Save requirement
                </Button>
                {createMutation.isError && <Alert severity="error">Unable to persist requirement</Alert>}
                {createMutation.isSuccess && <Alert severity="success">Requirement saved</Alert>}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {tabIndex === 1 && (
        <Box mt={2}>
          <Typography variant="subtitle1">Evidence Overrides</Typography>
          {approveMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Unable to approve evidence
            </Alert>
          )}
          <List>
            {atRiskQuery.isLoading && (
              <ListItem>
                <CircularProgress size={24} />
              </ListItem>
            )}
            {atRiskQuery.data?.atRisk.map((entry: any) => (
              <ListItem key={entry.person.id} alignItems="flex-start" sx={{ flexDirection: "column", gap: 1 }}>
                <ListItemText
                  primary={`${entry.person.name} (${entry.person.role})`}
                  secondary={entry.requirements.map((req: any) => `${req.requirement.name} · ${req.status}`).join(" · ")}
                />
                {entry.requirements.flatMap((req: any) => req.evidence).map((evidence: any) => (
                  <Button
                    key={evidence.id}
                    variant="outlined"
                    size="small"
                    onClick={() => approveMutation.mutate(evidence.id)}
                  >
                    Approve {evidence.type}
                  </Button>
                ))}
                {!entry.requirements.some((req: any) => req.evidence.length) && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    No evidence attached, capture evidence first
                  </Alert>
                )}
              </ListItem>
            ))}
            {!atRiskQuery.data?.atRisk.length && (
              <ListItem>
                <ListItemText primary="No overrides required today" />
              </ListItem>
            )}
          </List>
        </Box>
      )}

      {tabIndex === 2 && (
        <Box mt={2}>
          <Typography variant="subtitle1">Audit Trail</Typography>
          {auditQuery.isLoading && <CircularProgress size={24} />}
          <List>
            {auditQuery.data?.logs.map((log: any) => (
              <ListItem key={log.id}>
                <ListItemText
                  primary={`${log.who}: ${log.what}`}
                  secondary={`${new Date(log.when).toLocaleString()} · ${log.why}`}
                />
              </ListItem>
            ))}
            {!auditQuery.data?.logs.length && (
              <ListItem>
                <ListItemText primary="No audit entries yet" />
              </ListItem>
            )}
          </List>
        </Box>
      )}
    </Paper>
  );
}

export default AdminPage;

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
  TableSortLabel,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import {
  fetchTrainingRequirements,
  createTrainingRequirement,
  updateTrainingRequirement,
  deleteTrainingRequirement,
  fetchRoles,
  fetchAuditTrail,
  fetchManagerAtRisk,
  approveEvidence,
  fetchAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  fetchRecommendationSettings,
  updateRecommendationSettings,
} from "../services/api";
import { useUserContext } from "../context/UserContext";
import { Fragment, useEffect, useState } from "react";

const requiredLevelLabels: Record<number, string> = {
  1: "Essential",
  2: "Nice to have",
  3: "Home compliance",
};

const getDefaultFormValues = () => ({
  name: "",
  description: "",
  validityPeriodMonths: 12,
  requiredLevel: 1,
  category: "",
  importanceLevel: 3,
  minimumAttendees: 8,
  enabled: true,
  roleExternalIds: [] as string[],
});
type FormValues = ReturnType<typeof getDefaultFormValues>;

function AdminPage() {
  const { role, userEmail } = useUserContext();
  const [tabIndex, setTabIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accessForm, setAccessForm] = useState({ email: "", role: "manager" });
  const [formValues, setFormValues] = useState<FormValues>(getDefaultFormValues);
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "name",
    direction: "asc",
  });
  const [recommendationForm, setRecommendationForm] = useState({
    atRiskWindowDays: 60,
    minimumAttendeesDefault: 8,
    importanceWeightMultiplier: 2,
  });
  const clearForm = () => {
    setFormValues(getDefaultFormValues());
    setEditingId(null);
  };
  const clearFormIfEditing = (targetId: string) => {
    setEditingId((current) => {
      if (current === targetId) {
        setFormValues(getDefaultFormValues());
        return null;
      }
      return current;
    });
  };

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

  const recommendationSettingsQuery = useQuery({
    queryKey: ["adminRecommendationSettings", role],
    queryFn: () => fetchRecommendationSettings(role, userEmail).then((response) => response.data),
  });

  const atRiskQuery = useQuery({
    queryKey: ["adminAtRisk", role],
    queryFn: () => fetchManagerAtRisk(role, userEmail).then((response) => response.data),
  });

  const accessQuery = useQuery({
    queryKey: ["adminUsers", role],
    queryFn: () => fetchAdminUsers(role, userEmail).then((response) => response.data),
    enabled: role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => createTrainingRequirement(payload, role, userEmail),
    onSuccess: () => trainingRequirementsQuery.refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; body: any }) => updateTrainingRequirement(payload.id, payload.body, role, userEmail),
    onSuccess: () => trainingRequirementsQuery.refetch(),
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: (id: string) => deleteTrainingRequirement(id, role, userEmail),
    onSuccess: (_, deletedId) => {
      clearFormIfEditing(deletedId);
      trainingRequirementsQuery.refetch();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (evidenceId: string) => approveEvidence(evidenceId, { approvedBy: userEmail, confidenceOverride: 100 }, role, userEmail),
  });

  const accessMutation = useMutation({
    mutationFn: (payload: { email: string; role: string }) => upsertAdminUser(payload, role, userEmail),
    onSuccess: () => accessQuery.refetch(),
  });

  const deleteAccessMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id, role, userEmail),
    onSuccess: () => accessQuery.refetch(),
  });

  const updateRecommendationSettingsMutation = useMutation({
    mutationFn: (payload: any) => updateRecommendationSettings(payload, role, userEmail),
    onSuccess: () => recommendationSettingsQuery.refetch(),
  });

  useEffect(() => {
    if (recommendationSettingsQuery.data?.settings) {
      const settings = recommendationSettingsQuery.data.settings;
      setRecommendationForm({
        atRiskWindowDays: settings.atRiskWindowDays ?? 60,
        minimumAttendeesDefault: settings.minimumAttendeesDefault ?? 8,
        importanceWeightMultiplier: settings.importanceWeightMultiplier ?? 2,
      });
    }
  }, [recommendationSettingsQuery.data]);

  const handleRoleSelection = (event: SelectChangeEvent<typeof formValues.roleExternalIds>) => {
    const { value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      roleExternalIds: typeof value === "string" ? value.split(",") : value,
    }));
  };

  const sortedRequirements = [...(trainingRequirementsQuery.data?.requirements ?? [])].sort((a: any, b: any) => {
    const { key, direction } = sortState;
    const getValue = (item: any) => {
      switch (key) {
        case "name":
          return String(item.name ?? "").toLowerCase();
        case "validityPeriodMonths":
          return Number(item.validityPeriodMonths ?? 0);
        case "requiredLevel":
          return Number(item.requiredLevel ?? 0);
        case "category":
          return String(item.category ?? "").toLowerCase();
        case "importanceLevel":
          return Number(item.importanceLevel ?? 0);
        case "minimumAttendees":
          return Number(item.minimumAttendees ?? 0);
        case "enabled":
          return item.enabled ? 1 : 0;
        default:
          return String(item.name ?? "").toLowerCase();
      }
    };
    const left = getValue(a);
    const right = getValue(b);
    if (left < right) return direction === "asc" ? -1 : 1;
    if (left > right) return direction === "asc" ? 1 : -1;
    return 0;
  });

  const requirementGroups = [
    {
      label: "SCTV",
      items: sortedRequirements.filter((item: any) =>
        String(item.name ?? "").toLowerCase().includes("sctv"),
      ),
    },
    {
      label: "Competencies",
      items: sortedRequirements.filter((item: any) =>
        String(item.name ?? "").toLowerCase().includes("competency"),
      ),
    },
    {
      label: "Other Courses",
      items: sortedRequirements.filter(
        (item: any) =>
          !String(item.name ?? "").toLowerCase().includes("sctv") &&
          !String(item.name ?? "").toLowerCase().includes("competency"),
      ),
    },
  ];

  const handleSortChange = (key: string) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const renderSortLabel = (label: string, key: string) => (
    <TableSortLabel
      active={sortState.key === key}
      direction={sortState.key === key ? sortState.direction : "asc"}
      onClick={() => handleSortChange(key)}
    >
      {label}
    </TableSortLabel>
  );

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6">Admin Workspace</Typography>
      <Tabs value={tabIndex} onChange={(_, value) => setTabIndex(value)} sx={{ mt: 2 }}>
        <Tab label="Requirements" />
        <Tab label="Recommendations" />
        <Tab label="Evidence Overrides" />
        <Tab label="Audit Trail" />
        <Tab label="Access" />
      </Tabs>

      {tabIndex === 0 && (
        <Box mt={2}>
          <Typography variant="subtitle1">Defined Requirements</Typography>
          {trainingRequirementsQuery.isLoading && <CircularProgress size={24} />}
          {trainingRequirementsQuery.data && (
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{renderSortLabel("Name", "name")}</TableCell>
                  <TableCell>{renderSortLabel("Validity (months)", "validityPeriodMonths")}</TableCell>
                  <TableCell>{renderSortLabel("Level", "requiredLevel")}</TableCell>
                  <TableCell>{renderSortLabel("Category", "category")}</TableCell>
                  <TableCell>{renderSortLabel("Importance", "importanceLevel")}</TableCell>
                  <TableCell>{renderSortLabel("Min attendees", "minimumAttendees")}</TableCell>
                  <TableCell>{renderSortLabel("Enabled", "enabled")}</TableCell>
                  <TableCell>Roles</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {requirementGroups.map((group) => (
                  <Fragment key={group.label}>
                    <TableRow>
                      <TableCell colSpan={9} sx={{ bgcolor: "rgba(15, 98, 254, 0.08)" }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {group.label}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {group.items.map((requirement: any) => (
                      <TableRow key={requirement.id}>
                        <TableCell>{requirement.name}</TableCell>
                        <TableCell>{requirement.validityPeriodMonths}</TableCell>
                        <TableCell>
                          {requiredLevelLabels[requirement.requiredLevel] ?? requirement.requiredLevel ?? "-"}
                        </TableCell>
                        <TableCell>{requirement.category ?? "-"}</TableCell>
                        <TableCell>{requirement.importanceLevel ?? "-"}</TableCell>
                        <TableCell>{requirement.minimumAttendees ?? "-"}</TableCell>
                        <TableCell>{requirement.enabled ? "Yes" : "No"}</TableCell>
                        <TableCell>{requirement.roles.map((role: any) => role.name).join(", ")}</TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                            <Button
                              size="small"
                              onClick={() => {
                                setEditingId(requirement.id);
                                setFormValues({
                                  name: requirement.name ?? "",
                                  description: requirement.description ?? "",
                                  validityPeriodMonths: requirement.validityPeriodMonths ?? 12,
                                  requiredLevel: requirement.requiredLevel ?? 1,
                                  category: requirement.category ?? "",
                                  importanceLevel: requirement.importanceLevel ?? 3,
                                  minimumAttendees: requirement.minimumAttendees ?? 8,
                                  enabled: requirement.enabled ?? true,
                                  roleExternalIds: requirement.roles.map((role: any) => role.externalId),
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={deleteRequirementMutation.status === "pending"}
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `Delete “${requirement.name ?? "this requirement"}”? This will remove any evidence tied to it.`,
                                );
                                if (!confirmed) {
                                  return;
                                }
                                deleteRequirementMutation.mutate(requirement.id);
                              }}
                            >
                              Delete
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!group.items.length && (
                      <TableRow>
                        <TableCell colSpan={9} sx={{ color: "text.secondary" }}>
                          No courses in this section.
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}

          {deleteRequirementMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Unable to delete requirement
            </Alert>
          )}
          {deleteRequirementMutation.isSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Requirement deleted
            </Alert>
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
                label="Required Level (1 essential, 2 nice to have, 3 home compliance)"
                fullWidth
                size="small"
                type="number"
                value={formValues.requiredLevel}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, requiredLevel: Number(event.target.value) }))
                }
              />
              <TextField
                label="Importance level (1 low, 5 critical)"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 1, max: 5 }}
                value={formValues.importanceLevel}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, importanceLevel: Number(event.target.value) }))
                }
              />
              <TextField
                label="Minimum attendees"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 1 }}
                value={formValues.minimumAttendees}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, minimumAttendees: Number(event.target.value) }))
                }
              />
              <TextField
                label="Category (e.g. one-off)"
                fullWidth
                size="small"
                value={formValues.category}
                onChange={(event) => setFormValues((prev) => ({ ...prev, category: event.target.value }))}
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
                    checked={formValues.enabled}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, enabled: event.target.checked }))}
                  />
                }
                label="Enabled for recommendations"
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
              <Box sx={{ gridColumn: "1 / -1", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  disabled={createMutation.status === "pending" || updateMutation.status === "pending"}
                  onClick={() => {
                    const payload = {
                      name: formValues.name,
                      description: formValues.description,
                      validityPeriodMonths: formValues.validityPeriodMonths,
                      requiredLevel: formValues.requiredLevel,
                      category: formValues.category,
                      importanceLevel: formValues.importanceLevel,
                      minimumAttendees: formValues.minimumAttendees,
                      enabled: formValues.enabled,
                      roleExternalIds: formValues.roleExternalIds,
                    };
                    if (editingId) {
                      updateMutation.mutate({ id: editingId, body: payload });
                    } else {
                      createMutation.mutate(payload);
                    }
                  }}
                >
                  {editingId ? "Update requirement" : "Save requirement"}
                </Button>
                {editingId && (
                  <Button
                    variant="text"
                    onClick={clearForm}
                  >
                    Cancel
                  </Button>
                )}
                {createMutation.isError && <Alert severity="error">Unable to persist requirement</Alert>}
                {createMutation.isSuccess && <Alert severity="success">Requirement saved</Alert>}
                {updateMutation.isSuccess && <Alert severity="success">Requirement updated</Alert>}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {tabIndex === 1 && (
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>
            Recommendation Settings
          </Typography>
          {recommendationSettingsQuery.isLoading && <CircularProgress size={24} />}
          {recommendationSettingsQuery.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Unable to load recommendation settings
            </Alert>
          )}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
            <TextField
              label="At-risk window (days)"
              type="number"
              size="small"
              inputProps={{ min: 1 }}
              value={recommendationForm.atRiskWindowDays}
              onChange={(event) =>
                setRecommendationForm((prev) => ({ ...prev, atRiskWindowDays: Number(event.target.value) }))
              }
            />
            <TextField
              label="Default minimum attendees"
              type="number"
              size="small"
              inputProps={{ min: 1 }}
              value={recommendationForm.minimumAttendeesDefault}
              onChange={(event) =>
                setRecommendationForm((prev) => ({ ...prev, minimumAttendeesDefault: Number(event.target.value) }))
              }
            />
            <TextField
              label="Importance weight multiplier"
              type="number"
              size="small"
              inputProps={{ min: 1 }}
              value={recommendationForm.importanceWeightMultiplier}
              onChange={(event) =>
                setRecommendationForm((prev) => ({ ...prev, importanceWeightMultiplier: Number(event.target.value) }))
              }
            />
          </Box>
          <Box sx={{ mt: 2, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              disabled={updateRecommendationSettingsMutation.status === "pending"}
              onClick={() => updateRecommendationSettingsMutation.mutate(recommendationForm)}
            >
              Save settings
            </Button>
            {updateRecommendationSettingsMutation.isSuccess && <Alert severity="success">Settings updated</Alert>}
            {updateRecommendationSettingsMutation.isError && (
              <Alert severity="error">Unable to update recommendation settings</Alert>
            )}
          </Box>
        </Box>
      )}

      {tabIndex === 2 && (
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

      {tabIndex === 3 && (
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

      {tabIndex === 4 && (
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>
            Access Management
          </Typography>
          {role !== "admin" && (
            <Alert severity="warning">Only admins can manage access.</Alert>
          )}
          {role === "admin" && (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "2fr 1fr auto" }, alignItems: "center" }}>
              <TextField
                label="User email"
                size="small"
                value={accessForm.email}
                onChange={(event) => setAccessForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <FormControl size="small" fullWidth>
                <Select
                  value={accessForm.role}
                  onChange={(event) => setAccessForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="manager">Manager</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                disabled={accessMutation.status === "pending"}
                onClick={() => {
                  if (!accessForm.email.trim()) {
                    return;
                  }
                  accessMutation.mutate({
                    email: accessForm.email.trim(),
                    role: accessForm.role,
                  });
                }}
              >
                Add / Update
              </Button>
            </Box>
          )}
          <List sx={{ mt: 2 }}>
            {accessQuery.isLoading && (
              <ListItem>
                <CircularProgress size={24} />
              </ListItem>
            )}
            {accessQuery.data?.users?.map((user: any) => (
              <ListItem
                key={user.id}
                secondaryAction={
                  <Button
                    size="small"
                    color="error"
                    onClick={() => deleteAccessMutation.mutate(user.id)}
                  >
                    Remove
                  </Button>
                }
              >
                <ListItemText primary={user.email} secondary={`Role: ${user.role}`} />
              </ListItem>
            ))}
            {!accessQuery.isLoading && !accessQuery.data?.users?.length && (
              <ListItem>
                <ListItemText primary="No admin or manager accounts configured yet." />
              </ListItem>
            )}
          </List>
        </Box>
      )}
    </Paper>
  );
}

export default AdminPage;

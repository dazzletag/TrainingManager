import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  IconButton,
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
  fetchRequirementSections,
  createRequirementSection,
  fetchRoles,
  fetchAuditTrail,
  fetchManagerAtRisk,
  approveEvidence,
  fetchAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  fetchRecommendationSettings,
  updateRecommendationSettings,
  fetchPlandayFields,
} from "../services/api";
import { useUserContext } from "../context/UserContext";
import { useEffect, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";

const requiredLevelLabels: Record<number, string> = {
  1: "Essential",
  2: "Personal Development",
  3: "Home compliance",
};

const defaultSections = ["SCTV", "Competencies", "Other"];

const getDefaultFormValues = () => ({
  name: "",
  description: "",
  validityPeriodMonths: 12,
  category: "",
  importanceLevel: 3,
  minimumAttendees: 8,
  enabled: true,
  roleLevels: { 1: [] as string[], 2: [] as string[], 3: [] as string[] },
  section: defaultSections[2],
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
  const clearFormIfEditing = (targetId: string) => {
    setEditingId((current) => {
      if (current === targetId) {
        setFormValues(getDefaultFormValues());
        setFormDialogOpen(false);
        return null;
      }
      return current;
    });
  };
  const [sectionInput, setSectionInput] = useState("");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const resetForm = () => {
    setFormValues(getDefaultFormValues());
    setEditingId(null);
  };
  const handleOpenFormDialog = () => {
    resetForm();
    setFormDialogOpen(true);
  };
  const handleCloseFormDialog = () => {
    resetForm();
    setFormDialogOpen(false);
  };
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const sectionsQuery = useQuery({
    queryKey: ["adminRequirementSections", role],
    queryFn: () => fetchRequirementSections(role, userEmail).then((response) => response.data.sections),
  });
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const createSectionMutation = useMutation({
    mutationFn: (name: string) => createRequirementSection({ name }, role, userEmail),
    onSuccess: () => {
      sectionsQuery.refetch();
      setSectionInput("");
    },
  });

  const handleAddSection = () => {
    const trimmed = sectionInput.trim();
    if (!trimmed) {
      return;
    }
    createSectionMutation.mutate(trimmed);
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

  useEffect(() => {
    if (createMutation.isSuccess || updateMutation.isSuccess) {
      handleCloseFormDialog();
      createMutation.reset();
      updateMutation.reset();
    }
  }, [createMutation.isSuccess, updateMutation.isSuccess]);

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

  const plandayFieldsQuery = useQuery({
    queryKey: ["plandayFields", role],
    queryFn: () => fetchPlandayFields(role, userEmail).then((response) => response.data.fields as Array<{ id: string; name: string; dataType: string }>),
    enabled: tabIndex === 5,
  });

  const [savedMappingIds, setSavedMappingIds] = useState<Set<string>>(new Set());
  const fieldMappingMutation = useMutation({
    mutationFn: ({ id, fieldIdentifier }: { id: string; fieldIdentifier: string | null }) =>
      updateTrainingRequirement(id, { fieldIdentifier }, role, userEmail),
    onSuccess: (_data, variables) => {
      trainingRequirementsQuery.refetch();
      setSavedMappingIds((prev) => new Set(prev).add(variables.id));
      setTimeout(() => {
        setSavedMappingIds((prev) => {
          const next = new Set(prev);
          next.delete(variables.id);
          return next;
        });
      }, 2000);
    },
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

  const handleLevelRoleSelection = (level: 1 | 2 | 3) => (event: SelectChangeEvent<string[]>) => {
    const { value } = event.target;
    const ids = typeof value === "string" ? value.split(",") : value;
    setFormValues((prev) => ({
      ...prev,
      roleLevels: { ...prev.roleLevels, [level]: ids },
    }));
  };

  const KNOWN_GROUP_IDS = new Set([
    "21759", "21760", "20393", "20394", "20396", "20398", "21761",
    "20397", "20399", "21758", "21762", "21756", "20392", "20400", "20401",
  ]);

  const sortedRoles = [...(rolesQuery.data?.roles ?? [])]
    .filter((r: any) => KNOWN_GROUP_IDS.has(String(r.externalId)))
    .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));

  const requirements = trainingRequirementsQuery.data?.requirements ?? [];
  const sortedRequirements = [...requirements].sort((a: any, b: any) => {
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

  const getSectionLabel = (requirement: any): string => {
    const raw = (requirement.section ?? defaultSections[2]).trim();
    return raw || defaultSections[2];
  };
  const sectionsFromRequirements = Array.from(new Set(requirements.map(getSectionLabel))) as string[];
  const persistedSections = sectionsQuery.data ?? [];
  const availableSections: string[] = Array.from(
    new Set([
      ...defaultSections,
      ...(persistedSections.map((section: any) => section.name ?? "").filter(Boolean)),
      ...sectionsFromRequirements,
    ]),
  );
  const filteredRequirements = normalizedSearchTerm
    ? sortedRequirements.filter((item) => {
        const haystack = `${item.name ?? ""} ${item.description ?? ""}`.toLowerCase();
        return haystack.includes(normalizedSearchTerm);
      })
    : sortedRequirements;
  const sectionGroups = availableSections.map((label) => ({
    label,
    items: filteredRequirements.filter((requirement: any) => getSectionLabel(requirement) === label),
  }));

  useEffect(() => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      let changed = false;
      availableSections.forEach((label) => {
        if (!next.has(label)) {
          next.add(label);
          changed = true;
        }
      });
      if (!changed) {
        return prev;
      }
      return Array.from(next);
    });
  }, [availableSections]);

  const handleAccordionToggle = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return Array.from(next);
    });
  };

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
        <Tab label="Field Mapping" />
      </Tabs>

      {tabIndex === 0 && (
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>
            Defined Requirements
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              alignItems: "flex-end",
              mb: 1,
            }}
          >
            <TextField
              size="small"
              label="Search requirements"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {searchTerm && (
              <Button variant="text" onClick={() => setSearchTerm("")} sx={{ height: 40 }}>
                Clear
              </Button>
            )}
          </Box>
          {trainingRequirementsQuery.isLoading && <CircularProgress size={24} />}
          {sectionGroups.map((group) => (
            <Accordion
              key={group.label}
              expanded={expandedSections.includes(group.label)}
              onChange={() => handleAccordionToggle(group.label)}
              disableGutters
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {group.label}
                </Typography>
                <Typography variant="caption" sx={{ ml: 1 }}>
                  {group.items.length ? `${group.items.length} course${group.items.length > 1 ? "s" : ""}` : "empty"}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                {group.items.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{renderSortLabel("Name", "name")}</TableCell>
                        <TableCell>{renderSortLabel("Validity (months)", "validityPeriodMonths")}</TableCell>
                        <TableCell>Essential</TableCell>
                        <TableCell>Personal Development</TableCell>
                        <TableCell>Home Compliance</TableCell>
                        <TableCell>{renderSortLabel("Category", "category")}</TableCell>
                        <TableCell>{renderSortLabel("Importance", "importanceLevel")}</TableCell>
                        <TableCell>{renderSortLabel("Min attendees", "minimumAttendees")}</TableCell>
                        <TableCell>{renderSortLabel("Enabled", "enabled")}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.items.map((requirement: any) => (
                        <TableRow key={requirement.id}>
                          <TableCell>{requirement.name}</TableCell>
                          <TableCell>{requirement.validityPeriodMonths}</TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>
                            {(requirement.roleLevels?.[1] ?? []).map((r: any) => r.name).join(", ") || "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>
                            {(requirement.roleLevels?.[2] ?? []).map((r: any) => r.name).join(", ") || "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>
                            {(requirement.roleLevels?.[3] ?? []).map((r: any) => r.name).join(", ") || "-"}
                          </TableCell>
                          <TableCell>{requirement.category ?? "-"}</TableCell>
                          <TableCell>{requirement.importanceLevel ?? "-"}</TableCell>
                          <TableCell>{requirement.minimumAttendees ?? "-"}</TableCell>
                          <TableCell>{requirement.enabled ? "Yes" : "No"}</TableCell>
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
                                    category: requirement.category ?? "",
                                    importanceLevel: requirement.importanceLevel ?? 3,
                                    minimumAttendees: requirement.minimumAttendees ?? 8,
                                    enabled: requirement.enabled ?? true,
                                    roleLevels: {
                                      1: (requirement.roleLevels?.[1] ?? []).map((r: any) => r.externalId),
                                      2: (requirement.roleLevels?.[2] ?? []).map((r: any) => r.externalId),
                                      3: (requirement.roleLevels?.[3] ?? []).map((r: any) => r.externalId),
                                    },
                                    section: getSectionLabel(requirement),
                                  });
                                  setFormDialogOpen(true);
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
                    </TableBody>
                  </Table>
                ) : (
                  <Alert severity="info" sx={{ m: 2 }}>
                    No courses in this section.
                  </Alert>
                )}
              </AccordionDetails>
            </Accordion>
          ))}

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

          <Box mt={2} sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField
              label="New section"
              size="small"
              value={sectionInput}
              onChange={(event) => setSectionInput(event.target.value)}
            />
            <Button
              variant="outlined"
              onClick={handleAddSection}
              disabled={!sectionInput.trim()}
            >
              Add section
            </Button>
            <Typography variant="caption" sx={{ width: "100%" }}>
              Sections: {availableSections.join(", ")}
            </Typography>
          </Box>

          <Box mt={3} sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={handleOpenFormDialog}>
              Define new requirement
            </Button>
          </Box>
        </Box>
      )}
      <Dialog open={formDialogOpen} onClose={handleCloseFormDialog} fullWidth maxWidth="md">
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          {editingId ? "Edit requirement" : "Define new requirement"}
          <IconButton
            size="small"
            aria-label="Close dialog"
            onClick={handleCloseFormDialog}
            edge="end"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
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
            <Box sx={{ gridColumn: "1 / -1", display: "grid", gap: 2, gridTemplateColumns: "repeat(3, 1fr)" }}>
              {([1, 2, 3] as const).map((level) => (
                <FormControl key={level} fullWidth size="small">
                  <InputLabel>{requiredLevelLabels[level]}</InputLabel>
                  <Select
                    multiple
                    label={requiredLevelLabels[level]}
                    value={formValues.roleLevels[level]}
                    onChange={handleLevelRoleSelection(level)}
                    renderValue={(selected) =>
                      selected.length
                        ? sortedRoles
                            .filter((r: any) => selected.includes(r.externalId))
                            .map((r: any) => r.name)
                            .join(", ")
                        : "None"
                    }
                  >
                    {sortedRoles.map((roleOption: any) => (
                      <MenuItem key={roleOption.id} value={roleOption.externalId}>
                        {roleOption.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
            </Box>
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
            <FormControl fullWidth size="small">
              <InputLabel>Section</InputLabel>
              <Select
                value={formValues.section}
                label="Section"
                onChange={(event: SelectChangeEvent) =>
                  setFormValues((prev) => ({ ...prev, section: event.target.value }))
                }
              >
                {availableSections.map((label) => (
                  <MenuItem key={label} value={label}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFormDialog}>Cancel</Button>
          <Button
            variant="contained"
            disabled={createMutation.status === "pending" || updateMutation.status === "pending"}
            onClick={() => {
              const payload = {
                name: formValues.name,
                description: formValues.description,
                validityPeriodMonths: formValues.validityPeriodMonths,
                category: formValues.category,
                importanceLevel: formValues.importanceLevel,
                minimumAttendees: formValues.minimumAttendees,
                enabled: formValues.enabled,
                roleLevels: formValues.roleLevels,
                section: formValues.section,
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
        </DialogActions>
        {createMutation.isError && <Alert severity="error">Unable to persist requirement</Alert>}
        {createMutation.isSuccess && <Alert severity="success">Requirement saved</Alert>}
        {updateMutation.isSuccess && <Alert severity="success">Requirement updated</Alert>}
      </Dialog>

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
      {tabIndex === 5 && (
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>
            Planday Field Mapping
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Map each training requirement to the corresponding Planday employee field. When a date is recorded against a mapped field in Planday, it can be used as evidence for that requirement.
          </Typography>
          {(trainingRequirementsQuery.isLoading || plandayFieldsQuery.isLoading) && <CircularProgress size={24} />}
          {plandayFieldsQuery.isError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Unable to load Planday fields. Check that the Planday integration is configured.
            </Alert>
          )}
          {!trainingRequirementsQuery.isLoading && !plandayFieldsQuery.isLoading && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Training Requirement</TableCell>
                  <TableCell>Section</TableCell>
                  <TableCell>Planday Field</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {[...requirements]
                  .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
                  .map((req: any) => {
                    const plandayFields = plandayFieldsQuery.data ?? [];
                    // Only use stored fieldIdentifier if it actually matches a known Planday field
                    const matchedValue = plandayFields.some((f: any) => f.id === req.fieldIdentifier)
                      ? req.fieldIdentifier
                      : "";
                    return (
                      <TableRow key={req.id}>
                        <TableCell>{req.name}</TableCell>
                        <TableCell>{req.section ?? "Other"}</TableCell>
                        <TableCell sx={{ minWidth: 280 }}>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={matchedValue}
                              displayEmpty
                              onChange={(event: SelectChangeEvent) => {
                                const value = event.target.value || null;
                                fieldMappingMutation.mutate({ id: req.id, fieldIdentifier: value });
                              }}
                            >
                              <MenuItem value="">
                                <em>Not mapped</em>
                              </MenuItem>
                              {plandayFields.map((field) => (
                                <MenuItem key={field.id} value={field.id}>
                                  {field.name}
                                  {field.dataType && field.dataType !== "unknown" && (
                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                      ({field.dataType})
                                    </Typography>
                                  )}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ width: 60 }}>
                          {savedMappingIds.has(req.id) && (
                            <Chip label="Saved" size="small" color="success" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
          {fieldMappingMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>Unable to save mapping</Alert>
          )}
        </Box>
      )}
    </Paper>
  );
}

export default AdminPage;

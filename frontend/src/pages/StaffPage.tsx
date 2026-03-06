import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import { useUserContext } from "../context/UserContext";
import { fetchStaffDirectory, fetchStaffProfile, submitEvidence, fetchEmployeeHistory } from "../services/api";
import { Fragment, useEffect, useMemo, useState } from "react";

const formatDate = (value?: string | Date) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const formatDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const historyFieldLabels: Record<string, string> = {
  "/salary": "Salary",
  "/wage": "Wage",
  "/pay": "Pay",
  "/payCode": "Pay Code",
  "/payType": "Pay Type",
  "/jobTitle": "Job Title",
  "/title": "Job Title",
  "/position": "Position",
  "/employeeGroupId": "Employee Group",
  "/employeeTypeId": "Employee Type",
  "/department": "Department",
  "/departmentId": "Department",
  "/contractRule": "Contract Rule",
  "/employmentStatus": "Employment Status",
  "/homeLocation": "Home Location",
};

function friendlyPath(path: string): string {
  return historyFieldLabels[path] ?? path.replace(/^\//, "").replace(/([A-Z])/g, " $1").trim();
}

const statusColors: Record<string, "success" | "warning" | "error"> = {
  compliant: "success",
  "at-risk": "warning",
  missing: "error",
};

const requiredLevelLabels: Record<number, string> = {
  1: "Essential",
  2: "Nice to have",
  3: "Home compliance",
};

function StatusChip({ status }: { status: string }) {
  return <Chip label={status} color={statusColors[status] ?? "default"} size="small" />;
}

function flattenEvidence(requirements: any[]) {
  return requirements.flatMap((requirement) =>
    requirement.evidence.map((evidence: any) => ({
      requirementName: requirement.requirement.name,
      ...evidence,
    })),
  );
}

function StaffPage() {
  const { role, personExternalId, setPersonExternalId, userEmail } = useUserContext();
  const [form, setForm] = useState({
    type: "",
    source: "",
    validFrom: "",
    validTo: "",
    uploadedFileKey: "",
    verifiedBy: userEmail,
    confidenceLevel: 80,
    requirementId: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [homeFilter, setHomeFilter] = useState("all");

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data: directoryData, isFetching: isDirectoryFetching } = useQuery({
    queryKey: ["staffDirectory", role, userEmail, searchTerm, homeFilter],
    queryFn: () =>
      fetchStaffDirectory(role, userEmail, {
        limit: 500,
        search: searchTerm || undefined,
        home: homeFilter === "all" ? undefined : homeFilter,
        includeHomes: true,
      }).then((response) => response.data),
  });

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["staffProfile", personExternalId, role],
    queryFn: () =>
      fetchStaffProfile(personExternalId, role, userEmail).then((response) => response.data),
    enabled: Boolean(personExternalId),
  });

  const { data: historyData, isFetching: isHistoryFetching } = useQuery({
    queryKey: ["employeeHistory", personExternalId],
    queryFn: () =>
      fetchEmployeeHistory(personExternalId!, role, userEmail).then((response) => response.data),
    enabled: Boolean(personExternalId),
  });

  const personId = data?.person?.id;

  const mutation = useMutation({
    mutationFn: (payload: any) => submitEvidence(personId!, payload, role, userEmail),
    onSuccess: () => {
      refetch();
      setForm((prev) => ({ ...prev, type: "", source: "", uploadedFileKey: "", confidenceLevel: 80 }));
    },
  });

  const requirements: any[] = data?.requirements ?? [];

  const categorized = useMemo(() => {
    const essential = requirements.filter((item) => item.requirement.requiredLevel === 1);
    const nice = requirements.filter((item) => item.requirement.requiredLevel === 2);
    const home = requirements.filter((item) => item.requirement.requiredLevel === 3);
    const additional = requirements.filter(
      (item) =>
        ![1, 2, 3].includes(item.requirement.requiredLevel) &&
        (item.evidence?.length ?? 0) > 0,
    );
    const other = requirements.filter(
      (item) =>
        ![1, 2, 3].includes(item.requirement.requiredLevel) &&
        (item.evidence?.length ?? 0) === 0,
    );

    const sortByName = (a: any, b: any) =>
      (a.requirement.name ?? "").localeCompare(b.requirement.name ?? "");

    return [
      { label: "Essential", items: essential.sort(sortByName) },
      { label: "Nice to have", items: nice.sort(sortByName) },
      { label: "Home compliance", items: home.sort(sortByName) },
      { label: "Additional evidence", items: additional.sort(sortByName) },
      { label: "Other", items: other.sort(sortByName) },
    ].filter((section) => section.items.length > 0);
  }, [requirements]);

  const evidenceList = useMemo(() => flattenEvidence(requirements), [requirements]);

  const soonExpiries = requirements.filter(
    (item) => item.expiry && new Date(item.expiry) > new Date(),
  );

  const staffOptions = useMemo(() => {
    const people = directoryData?.people ?? [];
    return [...people].sort((a: any, b: any) => {
      const aLast = a.fullName?.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
      const bLast = b.fullName?.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
      const lastCompare = aLast.localeCompare(bLast);
      if (lastCompare !== 0) return lastCompare;
      return (a.fullName ?? "").localeCompare(b.fullName ?? "");
    });
  }, [directoryData?.people]);

  const homeOptions = directoryData?.homes ?? [];
  const hasSelectedPerson = staffOptions.some((person: any) => person.externalId === personExternalId);

  return (
    <Stack direction="column" spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Staff Search</Typography>
        <Stack spacing={2} mt={2}>
          <TextField
            label="Search staff"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, email, or ID"
            size="small"
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="home-filter-label">Home</InputLabel>
              <Select
                labelId="home-filter-label"
                value={homeFilter}
                label="Home"
                onChange={(event) => setHomeFilter(event.target.value)}
              >
                <MenuItem value="all">All homes</MenuItem>
                {homeOptions.map((home: string) => (
                  <MenuItem key={home} value={home}>
                    {home}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 320 }}>
              <InputLabel id="staff-select-label">Staff member</InputLabel>
              <Select
                labelId="staff-select-label"
                value={personExternalId || ""}
                label="Staff member"
                onChange={(event) => setPersonExternalId(event.target.value)}
                disabled={isDirectoryFetching}
              >
                {!hasSelectedPerson && personExternalId && (
                  <MenuItem value={personExternalId}>{personExternalId}</MenuItem>
                )}
                {staffOptions.map((person: any) => (
                  <MenuItem key={person.externalId} value={person.externalId}>
                    {person.fullName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          {isDirectoryFetching && (
            <Typography variant="caption" color="text.secondary">
              Updating staff list...
            </Typography>
          )}
        </Stack>
      </Paper>
      <Paper sx={{ p: 3, position: "relative" }}>
        {isFetching && (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", bgcolor: "rgba(255,255,255,0.6)" }}>
            <CircularProgress />
          </Box>
        )}
        <Typography variant="h6">Staff Compliance Snapshot</Typography>
        {error && <Alert severity="error">Unable to load staff data</Alert>}
        {data && (
          <Box mt={2}>
            <Typography variant="subtitle1">{data.person.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {data.person.role} · {data.person.homeLocation}
            </Typography>
            <Stack direction="row" spacing={3} mt={1}>
              {data.person.dateOfBirth && (
                <Typography variant="body2" color="text.secondary">
                  Date of birth: <strong>{formatDate(data.person.dateOfBirth)}</strong>
                </Typography>
              )}
              {data.person.hiredDate && (
                <Typography variant="body2" color="text.secondary">
                  Hired: <strong>{formatDate(data.person.hiredDate)}</strong>
                </Typography>
              )}
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Requirement</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Expiry</TableCell>
                  <TableCell>Evidence Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categorized.map((section) => (
                  <Fragment key={section.label}>
                    <TableRow key={section.label}>
                      <TableCell colSpan={6} sx={{ bgcolor: "grey.100" }}>
                        <Typography variant="subtitle2">{section.label}</Typography>
                      </TableCell>
                    </TableRow>
                    {section.items.map((item: any) => (
                      <TableRow key={item.requirement.id}>
                        <TableCell>{item.requirement.name}</TableCell>
                        <TableCell>
                          <StatusChip status={item.status} />
                        </TableCell>
                        <TableCell>
                          {requiredLevelLabels[item.requirement.requiredLevel] ?? item.requirement.requiredLevel ?? "-"}
                        </TableCell>
                        <TableCell>{item.requirement.category ?? "-"}</TableCell>
                        <TableCell>{formatDate(item.expiry)}</TableCell>
                        <TableCell>{item.evidence.length}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <Box mt={2}>
              <Typography variant="body2" color="text.secondary">
                Expiry timeline:
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                }}
              >
                {soonExpiries.map((item) => (
                  <Paper key={item.requirement.id} sx={{ p: 1 }}>
                    <Typography variant="subtitle2">{item.requirement.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Expires {formatDate(item.expiry)}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Upload Evidence</Typography>
        <Stack component="form" spacing={2} mt={2}>
          <FormControl size="small" fullWidth>
            <InputLabel id="requirement-select-label">Requirement</InputLabel>
            <Select
              labelId="requirement-select-label"
              label="Requirement"
              value={form.requirementId}
              onChange={(event) => setForm((prev) => ({ ...prev, requirementId: event.target.value }))}
              disabled={!requirements.length}
            >
              {requirements.map((item: any) => (
                <MenuItem key={item.requirement.id} value={item.requirement.id}>
                  {item.requirement.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Type"
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            size="small"
          />
          <TextField
            label="Source"
            value={form.source}
            onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
            size="small"
          />
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            }}
          >
            <TextField
              label="Valid From"
              type="date"
              value={form.validFrom}
              onChange={(event) => setForm((prev) => ({ ...prev, validFrom: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
              size="small"
            />
            <TextField
              label="Valid To"
              type="date"
              value={form.validTo}
              onChange={(event) => setForm((prev) => ({ ...prev, validTo: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
              size="small"
            />
          </Box>
          <TextField
            label="Uploaded File Key"
            value={form.uploadedFileKey}
            onChange={(event) => setForm((prev) => ({ ...prev, uploadedFileKey: event.target.value }))}
            size="small"
          />
          <TextField
            label="Verified By"
            value={form.verifiedBy}
            onChange={(event) => setForm((prev) => ({ ...prev, verifiedBy: event.target.value }))}
            size="small"
          />
          <TextField
            label="Confidence Level"
            type="number"
            value={form.confidenceLevel}
            onChange={(event) => setForm((prev) => ({ ...prev, confidenceLevel: Number(event.target.value) }))}
            size="small"
            inputProps={{ min: 0, max: 100 }}
          />
          <Button
            variant="contained"
            disabled={!personId || mutation.status === "pending"}
            onClick={() => {
              mutation.mutate({
                requirementId: form.requirementId,
                type: form.type,
                source: form.source,
                validFrom: form.validFrom,
                validTo: form.validTo,
                uploadedFileKey: form.uploadedFileKey,
                verifiedBy: form.verifiedBy,
                confidenceLevel: form.confidenceLevel,
              });
            }}
          >
            Submit Evidence
          </Button>
          {mutation.isError && <Alert severity="error">Unable to create evidence</Alert>}
          {mutation.isSuccess && <Alert severity="success">Evidence accepted</Alert>}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Evidence Ledger</Typography>
        <List dense>
          {evidenceList.map((item) => (
            <ListItem key={item.id}>
              <ListItemText
                primary={`${item.requirementName} · ${item.type}`}
                secondary={`Valid until ${formatDate(item.validTo)}`}
              />
            </ListItem>
          ))}
          {!evidenceList.length && (
            <ListItem>
              <ListItemText primary="No evidence uploaded yet" />
            </ListItem>
          )}
        </List>
      </Paper>

      <Paper sx={{ p: 3, position: "relative" }}>
        {isHistoryFetching && (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", bgcolor: "rgba(255,255,255,0.6)" }}>
            <CircularProgress />
          </Box>
        )}
        <Typography variant="h6">Employment History</Typography>
        {!personExternalId && (
          <Typography variant="body2" color="text.secondary" mt={1}>
            Select a staff member to view their history.
          </Typography>
        )}
        {historyData && (
          <Table size="small" sx={{ mt: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Field</TableCell>
                <TableCell>New Value</TableCell>
                <TableCell>Operation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(historyData.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ color: "text.secondary" }}>
                    No history available.
                  </TableCell>
                </TableRow>
              )}
              {(historyData.data ?? []).map((entry: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>{formatDateTime(entry.modificationDateTime)}</TableCell>
                  <TableCell>{friendlyPath(entry.path ?? "")}</TableCell>
                  <TableCell>{entry.value ?? "-"}</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem" }}>{entry.op}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}

export default StaffPage;

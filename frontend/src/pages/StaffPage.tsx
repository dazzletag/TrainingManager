import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
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
import { fetchStaffProfile, submitEvidence } from "../services/api";
import { useMemo, useState } from "react";

const formatDate = (value?: string | Date) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

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
  const { role, personExternalId, userEmail } = useUserContext();
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

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["staffProfile", personExternalId, role],
    queryFn: () =>
      fetchStaffProfile(personExternalId, role, userEmail).then((response) => response.data),
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

  const evidenceList = useMemo(() => flattenEvidence(requirements), [requirements]);

  const soonExpiries = requirements.filter(
    (item) => item.expiry && new Date(item.expiry) > new Date(),
  );

  return (
    <Stack direction="column" spacing={3}>
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
                {requirements.map((item) => (
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
          <TextField
            label="Requirement ID"
            value={form.requirementId}
            onChange={(event) => setForm((prev) => ({ ...prev, requirementId: event.target.value }))}
            helperText="Copy requirement UUID from the table above"
            size="small"
          />
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
    </Stack>
  );
}

export default StaffPage;

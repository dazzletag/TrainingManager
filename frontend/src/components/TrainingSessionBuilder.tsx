import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
  Chip,
} from "@mui/material";
import { useMemo, useState, type DragEvent } from "react";
import { useUserContext } from "../context/UserContext";
import {
  assignPersonToSession,
  createTrainingSession,
  fetchSchedulerOverview,
  publishTrainingSession,
  deleteTrainingSession,
  removeSessionAssignment,
  recommendTrainingSession,
} from "../services/api";

type DragPayload = {
  personId: string;
  assignmentId?: string;
  day?: number;
  source: "unassigned" | "day1" | "day2";
  sourceSessionId?: string;
};

type SessionAssignment = {
  id: string;
  dropZoneId: string;
  person: {
    id: string;
    externalId: string;
    name: string;
    email: string;
    role: string;
    home?: string;
    primaryDepartmentId?: string;
    status: string;
    nextDue?: string;
    lastTrainingAt?: string;
  };
};

type SessionOverview = {
  id: string;
  name: string;
  type: string;
  day1: string;
  day2: string;
  day1StartTime?: string;
  day1EndTime?: string;
  day2StartTime?: string;
  day2EndTime?: string;
  day1Assignments: SessionAssignment[];
  day2Assignments: SessionAssignment[];
};

type UnassignedPerson = {
  id: string;
  externalId: string;
  name: string;
  role: string;
  home: string;
  primaryDepartmentId?: string;
  status: string;
  employmentStatus: string;
  nextDue?: string;
  lastTrainingAt?: string;
};

type PublishFeedback = {
  results: {
    personId: string;
    day: number;
    moved: boolean;
    reason?: string;
    debug?: {
      step: string;
      request: {
        method: string;
        url: string;
        payload: Record<string, unknown>;
      };
      response?: {
        status: number;
        data: unknown;
      };
    };
  }[];
  publishedAt: string;
};

type SchedulerOverviewData = {
  overview: SessionOverview[];
  unassigned: UnassignedPerson[];
};

const homePalette = ["#e3f2fd", "#f3e5f5", "#e8f5e9", "#fff3e0", "#fbe9e7"];
const homeColorOverrides: Record<string, string> = {
  "7653": "#CFE0B4",
  "7655": "#B7D7EA",
  "7652": "#E6B6CA",
  "7654": "#D4C1D8",
};
const getHomeKey = (person: { primaryDepartmentId?: string; home?: string }) =>
  person.primaryDepartmentId ?? person.home ?? "Unknown";

function TrainingSessionBuilder() {
  const { role, userEmail } = useUserContext();
  const queryClient = useQueryClient();
  const overviewKey = ["schedulerOverview", role];
  const [form, setForm] = useState({
    name: "",
    type: "Mandatory Training",
    day1: "",
    day2: "",
    day1StartTime: "09:15",
    day1EndTime: "15:45",
    day2StartTime: "09:15",
    day2EndTime: "15:45",
  });
  const [publishFeedback, setPublishFeedback] = useState<Record<string, PublishFeedback>>({});
  const [publishErrors, setPublishErrors] = useState<Record<string, boolean>>({});
  const [recommendFeedback, setRecommendFeedback] = useState<Record<string, { count: number; at: string }>>({});
  const [recommendErrors, setRecommendErrors] = useState<Record<string, boolean>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => fetchSchedulerOverview(role, userEmail).then((response) => response.data),
  });

  const sessions: SessionOverview[] = overviewQuery.data?.overview ?? [];
  const unassigned: UnassignedPerson[] = overviewQuery.data?.unassigned ?? [];

  const assignMutation = useMutation({
    mutationFn: (payload: { sessionId: string; personId: string; day: number; dropZoneId: string }) =>
      assignPersonToSession(payload, role, userEmail),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: overviewKey });
      const previous = queryClient.getQueryData<SchedulerOverviewData>(overviewKey);
      if (!previous) {
        return { previous };
      }

      const personFromUnassigned = previous.unassigned.find((person) => person.id === payload.personId);
      let assignmentPerson: SessionAssignment["person"] | null = null;

      if (personFromUnassigned) {
        assignmentPerson = {
          id: personFromUnassigned.id,
          externalId: personFromUnassigned.externalId,
          name: personFromUnassigned.name,
          email: "",
          role: personFromUnassigned.role,
          home: personFromUnassigned.home,
          primaryDepartmentId: personFromUnassigned.primaryDepartmentId,
          status: personFromUnassigned.status,
          nextDue: personFromUnassigned.nextDue,
          lastTrainingAt: personFromUnassigned.lastTrainingAt,
        };
      } else {
        for (const session of previous.overview) {
          const assignment = [...session.day1Assignments, ...session.day2Assignments].find(
            (entry) => entry.person.id === payload.personId,
          );
          if (assignment) {
            assignmentPerson = assignment.person;
            break;
          }
        }
      }

      if (!assignmentPerson) {
        return { previous };
      }

      const optimisticIdBase = `optimistic-${payload.sessionId}-${payload.personId}-${Date.now()}`;
      const day1Assignment: SessionAssignment = {
        id: `${optimisticIdBase}-day-1`,
        dropZoneId: `${optimisticIdBase}-drop-day-1`,
        person: assignmentPerson,
      };
      const day2Assignment: SessionAssignment = {
        id: `${optimisticIdBase}-day-2`,
        dropZoneId: `${optimisticIdBase}-drop-day-2`,
        person: assignmentPerson,
      };

      const updatedOverview = previous.overview.map((session) => {
        const filteredDay1 = session.day1Assignments.filter(
          (assignment) => assignment.person.id !== payload.personId,
        );
        const filteredDay2 = session.day2Assignments.filter(
          (assignment) => assignment.person.id !== payload.personId,
        );

        if (session.id !== payload.sessionId) {
          return {
            ...session,
            day1Assignments: filteredDay1,
            day2Assignments: filteredDay2,
          };
        }

        return {
          ...session,
          day1Assignments: [day1Assignment, ...filteredDay1],
          day2Assignments: [day2Assignment, ...filteredDay2],
        };
      });

      const updatedUnassigned = previous.unassigned.filter((person) => person.id !== payload.personId);

      queryClient.setQueryData<SchedulerOverviewData>(overviewKey, {
        overview: updatedOverview,
        unassigned: updatedUnassigned,
      });

      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(overviewKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: overviewKey }),
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => removeSessionAssignment(assignmentId, role, userEmail),
    onMutate: async (assignmentId) => {
      await queryClient.cancelQueries({ queryKey: overviewKey });
      const previous = queryClient.getQueryData<SchedulerOverviewData>(overviewKey);
      if (!previous) {
        return { previous };
      }

      let removedPerson: UnassignedPerson | null = null;
      const updatedOverview = previous.overview.map((session) => {
        const nextDay1 = session.day1Assignments.filter((assignment) => {
          if (assignment.id === assignmentId) {
            removedPerson = {
              id: assignment.person.id,
              externalId: assignment.person.externalId,
              name: assignment.person.name,
              role: assignment.person.role,
              home: assignment.person.home ?? "Unknown",
              primaryDepartmentId: assignment.person.primaryDepartmentId,
              status: assignment.person.status,
              employmentStatus: "unknown",
              nextDue: assignment.person.nextDue,
              lastTrainingAt: assignment.person.lastTrainingAt,
            };
            return false;
          }
          return true;
        });
        const nextDay2 = session.day2Assignments.filter((assignment) => {
          if (assignment.id === assignmentId) {
            removedPerson = {
              id: assignment.person.id,
              externalId: assignment.person.externalId,
              name: assignment.person.name,
              role: assignment.person.role,
              home: assignment.person.home ?? "Unknown",
              primaryDepartmentId: assignment.person.primaryDepartmentId,
              status: assignment.person.status,
              employmentStatus: "unknown",
              nextDue: assignment.person.nextDue,
              lastTrainingAt: assignment.person.lastTrainingAt,
            };
            return false;
          }
          return true;
        });
        return {
          ...session,
          day1Assignments: nextDay1,
          day2Assignments: nextDay2,
        };
      });

      let updatedUnassigned = previous.unassigned;
      if (removedPerson) {
        const stillAssigned = updatedOverview.some((session) =>
          [...session.day1Assignments, ...session.day2Assignments].some(
            (assignment) => assignment.person.id === removedPerson?.id,
          ),
        );
        if (!stillAssigned && !updatedUnassigned.some((person) => person.id === removedPerson?.id)) {
          updatedUnassigned = [
            removedPerson,
            ...updatedUnassigned,
          ];
        }
      }

      queryClient.setQueryData<SchedulerOverviewData>(overviewKey, {
        overview: updatedOverview,
        unassigned: updatedUnassigned,
      });

      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(overviewKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: overviewKey }),
  });

  const createSessionMutation = useMutation({
    mutationFn: (payload: { name: string; type: string; day1: string; day2: string; day1StartTime: string; day1EndTime: string; day2StartTime: string; day2EndTime: string }) =>
      createTrainingSession(payload, role, userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });
      setForm({
        name: "",
        type: "Mandatory Training",
        day1: "",
        day2: "",
        day1StartTime: "09:15",
        day1EndTime: "15:45",
        day2StartTime: "09:15",
        day2EndTime: "15:45",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (sessionId: string) =>
      publishTrainingSession(sessionId, role, userEmail).then((response) => response.data),
    onSuccess: (data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });
      setPublishErrors((prev) => ({ ...prev, [sessionId]: false }));
      setPublishFeedback((prev) => ({
        ...prev,
        [sessionId]: {
          results: data.results,
          publishedAt: data.publishedAt,
        },
      }));
    },
    onError: (_error, sessionId) => {
      setPublishErrors((prev) => ({ ...prev, [sessionId]: true }));
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => deleteTrainingSession(sessionId, role, userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });
    },
  });

  const recommendMutation = useMutation({
    mutationFn: (sessionId: string) =>
      recommendTrainingSession(sessionId, role, userEmail).then((response) => response.data),
    onSuccess: (data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });
      setRecommendErrors((prev) => ({ ...prev, [sessionId]: false }));
      const count = data.recommended?.length ?? 0;
      setRecommendFeedback((prev) => ({
        ...prev,
        [sessionId]: {
          count,
          at: new Date().toISOString(),
        },
      }));
    },
    onError: (_error, sessionId) => {
      setRecommendErrors((prev) => ({ ...prev, [sessionId]: true }));
    },
  });

  const homeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const homes = new Set<string>();
    unassigned.forEach((person) => homes.add(getHomeKey(person)));
    sessions.forEach((session) => {
      session.day1Assignments.forEach((assignment) => homes.add(getHomeKey(assignment.person)));
      session.day2Assignments.forEach((assignment) => homes.add(getHomeKey(assignment.person)));
    });
    Array.from(homes).forEach((home, index) => {
      map.set(home, homeColorOverrides[home] ?? homePalette[index % homePalette.length]);
    });
    return map;
  }, [unassigned, sessions]);

  const handleDragStart = (event: DragEvent<HTMLDivElement>, payload: DragPayload) => {
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  };

  const parseDragPayload = (event: DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  };

  const removeAssignmentsForPerson = async (sessionId: string, personId: string) => {
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;
    const assignments = [...session.day1Assignments, ...session.day2Assignments].filter(
      (assignment) => assignment.person.id === personId,
    );
    if (!assignments.length) return;
    await Promise.all(assignments.map((assignment) => removeMutation.mutateAsync(assignment.id)));
  };

  const handleDropOnDay = async (event: DragEvent<HTMLDivElement>, sessionId: string, day: number) => {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;

    if (payload.sourceSessionId && payload.sourceSessionId !== sessionId) {
      await removeAssignmentsForPerson(payload.sourceSessionId, payload.personId);
    }

    const dropZoneId = `session-${sessionId}-day-${day}-${payload.personId}-${Date.now()}`;
    assignMutation.mutate({ sessionId, personId: payload.personId, day, dropZoneId });
  };

  const handleDropToUnassigned = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;

    if (payload.sourceSessionId) {
      await removeAssignmentsForPerson(payload.sourceSessionId, payload.personId);
      return;
    }

    if (payload.assignmentId) {
      removeMutation.mutate(payload.assignmentId);
    }
  };

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "-";

  const mandatoryUnassigned = useMemo(() => {
    const statusOrder = new Map([
      ["missing", 0],
      ["at-risk", 1],
      ["compliant", 2],
    ]);
    return unassigned
      .filter((person) => person.status !== "compliant")
      .slice()
      .sort((a, b) => {
        const statusDelta = (statusOrder.get(a.status) ?? 99) - (statusOrder.get(b.status) ?? 99);
        if (statusDelta !== 0) return statusDelta;
        if (!a.nextDue && !b.nextDue) return 0;
        if (!a.nextDue) return 1;
        if (!b.nextDue) return -1;
        return new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime();
      });
  }, [unassigned]);

  const findPersonName = (session: SessionOverview, personId: string) => {
    const assignments = [...session.day1Assignments, ...session.day2Assignments];
    return assignments.find((assignment) => assignment.person.id === personId)?.person.name ?? personId;
  };

  const getAttendeeCount = (session: SessionOverview) => {
    const ids = new Set(
      [...session.day1Assignments, ...session.day2Assignments].map((assignment) => assignment.person.id),
    );
    return ids.size;
  };

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Training session planning</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Create a session, drop people into Day 1/Day 2, then publish to update Planday shifts. Cards are coloured by
          home so you can spot allocations at a glance.
        </Typography>
        <Stack component="form" spacing={2} mt={2}>
          <TextField
            label="Session name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            size="small"
            fullWidth
          />
          <TextField
            label="Type"
            size="small"
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            fullWidth
          />
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              label="Day 1"
              type="date"
              size="small"
              value={form.day1}
              onChange={(event) => setForm((prev) => ({ ...prev, day1: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Day 1 start"
              type="time"
              size="small"
              value={form.day1StartTime}
              onChange={(event) => setForm((prev) => ({ ...prev, day1StartTime: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
            />
            <TextField
              label="Day 1 end"
              type="time"
              size="small"
              value={form.day1EndTime}
              onChange={(event) => setForm((prev) => ({ ...prev, day1EndTime: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
            />
          </Stack>
          <Stack spacing={2} direction={{ xs: "column", md: "row" }}>
            <TextField
              label="Day 2"
              type="date"
              size="small"
              value={form.day2}
              onChange={(event) => setForm((prev) => ({ ...prev, day2: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Day 2 start"
              type="time"
              size="small"
              value={form.day2StartTime}
              onChange={(event) => setForm((prev) => ({ ...prev, day2StartTime: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
            />
            <TextField
              label="Day 2 end"
              type="time"
              size="small"
              value={form.day2EndTime}
              onChange={(event) => setForm((prev) => ({ ...prev, day2EndTime: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
            />
          </Stack>
          <Button
            variant="contained"
            onClick={() => createSessionMutation.mutate(form)}
            disabled={
              !form.name ||
              !form.day1 ||
              !form.day2 ||
              !form.day1StartTime ||
              !form.day1EndTime ||
              !form.day2StartTime ||
              !form.day2EndTime ||
              createSessionMutation.isPending
            }
          >
            Create session
          </Button>
        </Stack>
        {createSessionMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Unable to create session
          </Alert>
        )}
        {overviewQuery.isLoading && (
          <Typography variant="caption" color="text.secondary" mt={1}>
            Loading planners from the scheduler...
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6">Mandatory training sessions</Typography>
            <Typography variant="body2" color="text.secondary">
              Drag staff between sessions to rebalance the plan. Drop cards back on the left to unassign.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => setIsCollapsed((prev) => !prev)}>
            {isCollapsed ? "Expand cards" : "Collapse cards"}
          </Button>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", lg: "320px 1fr" },
          }}
        >
          <Paper
            sx={{
              p: 2,
              backgroundColor: (theme) => theme.palette.background.default,
              minHeight: 300,
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropToUnassigned}
          >
            <Typography variant="subtitle1" mb={1}>
              Possible attendees
            </Typography>
            <Typography variant="subtitle2" color="text.secondary" mb={1}>
              Drag an assignment card here to remove it, or drag staff into a session.
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: "1fr",
                maxHeight: { xs: 360, lg: 520 },
                overflowY: "auto",
                pr: 1,
              }}
            >
              {mandatoryUnassigned.map((person) => (
                <Paper
                  key={person.id}
                  draggable
                  onDragStart={(event) =>
                    handleDragStart(event, { personId: person.id, source: "unassigned" })
                  }
                  sx={{
                    px: 2,
                    py: isCollapsed ? 0.6 : 1,
                    borderRight: "7px solid #0078D7",
                    backgroundColor: homeColorMap.get(getHomeKey(person)) ?? "grey.600",
                    color: "common.black",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body1" sx={{ color: "common.black" }}>
                        {person.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "common.black", opacity: 0.9 }}>
                        {person.role} - due {person.nextDue ? formatDate(person.nextDue) : "no date"}
                      </Typography>
                    </Box>
                    <Chip
                      label={person.nextDue ? formatDate(person.nextDue) : "no date"}
                      size="small"
                      sx={{ bgcolor: "rgba(255,255,255,0.7)", color: "common.black" }}
                    />
                  </Stack>
                  {!isCollapsed && (
                    <Typography variant="caption" sx={{ color: "common.black", opacity: 0.9 }}>
                      Home: {person.home} - last training {person.lastTrainingAt ? formatDate(person.lastTrainingAt) : "-"}
                    </Typography>
                  )}
                </Paper>
              ))}
              {!mandatoryUnassigned.length && (
                <Typography color="text.secondary">Everyone has been allocated.</Typography>
              )}
            </Box>
          </Paper>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              overflowX: "auto",
              pb: 1,
            }}
          >
            {sessions.map((session) => {
              const feedback = publishFeedback[session.id];
              const recommend = recommendFeedback[session.id];
              const hasPublishError = publishErrors[session.id];
              const hasRecommendError = recommendErrors[session.id];
              const skippedResults = feedback?.results.filter((result) => !result.moved) ?? [];
              const attendeeCount = getAttendeeCount(session);

              return (
                <Paper key={session.id} sx={{ p: 2, minWidth: 420, flex: "0 0 auto" }}>
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="h6">
                        {session.name} ({attendeeCount})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(session.day1)} / {formatDate(session.day2)}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button
                        variant="contained"
                        size="small"
                        disabled={publishMutation.isPending}
                        onClick={() => publishMutation.mutate(session.id)}
                      >
                        Publish
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={recommendMutation.isPending}
                        onClick={() => recommendMutation.mutate(session.id)}
                      >
                        Recommend
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        disabled={deleteSessionMutation.isPending}
                        onClick={() => {
                          if (!window.confirm(`Delete session ${session.name}?`)) return;
                          deleteSessionMutation.mutate(session.id);
                        }}
                      >
                        Delete
                      </Button>
                    </Stack>

                    {hasPublishError && (
                      <Alert severity="error">Unable to publish the session to Planday</Alert>
                    )}
                    {hasRecommendError && (
                      <Alert severity="error">Unable to generate recommendations</Alert>
                    )}

                    {feedback && (
                      <Box>
                        <Alert severity="success">
                          Published {session.name} ({skippedResults.length ? "with warnings" : "all shifts moved"}) - {new Date(feedback.publishedAt).toLocaleTimeString()}
                        </Alert>
                        {skippedResults.length > 0 && (
                          <Alert severity="warning" sx={{ mt: 1 }}>
                            Skipped updating {skippedResults.length} employee(s):
                            <Stack component="ul" sx={{ mt: 1, ml: 2 }}>
                              {skippedResults.map((result) => (
                                <li key={`${result.personId}-${result.day}`}>
                                  {findPersonName(session, result.personId)} - {result.reason ?? "reason unknown"}
                                  {result.debug && (
                                    <Box
                                      component="pre"
                                      sx={{
                                        mt: 1,
                                        mb: 0,
                                        p: 1,
                                        borderRadius: 1,
                                        bgcolor: "background.default",
                                        fontFamily: "monospace",
                                        fontSize: "0.75rem",
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {JSON.stringify(result.debug, null, 2)}
                                    </Box>
                                  )}
                                </li>
                              ))}
                            </Stack>
                          </Alert>
                        )}
                      </Box>
                    )}

                    {recommend && (
                      <Alert severity="success">
                        Recommended {recommend.count} staff for {session.name} - {new Date(recommend.at).toLocaleTimeString()}
                      </Alert>
                    )}

                    <Box
                      sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      }}
                    >
                      {[1, 2].map((day) => (
                        <Paper
                          key={`${session.id}-day-${day}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleDropOnDay(event, session.id, day)}
                          sx={{
                            minHeight: 220,
                            p: 2,
                            border: "1px dashed",
                            borderColor: "divider",
                          }}
                        >
                          <Typography variant="subtitle1" gutterBottom>
                            Day {day} - {day === 1 ? formatDate(session.day1) : formatDate(session.day2)}
                          </Typography>
                          <Stack spacing={1}>
                            {(day === 1 ? session.day1Assignments : session.day2Assignments).map(
                              (assignment) => (
                                <Paper
                                  key={assignment.id}
                                  draggable
                                  onDragStart={(event) =>
                                    handleDragStart(event, {
                                      personId: assignment.person.id,
                                      assignmentId: assignment.id,
                                      day,
                                      source: day === 1 ? "day1" : "day2",
                                      sourceSessionId: session.id,
                                    })
                                  }
                                  sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    px: 2,
                                    py: isCollapsed ? 0.6 : 1,
                                    borderRight: "7px solid #0078D7",
                                    backgroundColor: homeColorMap.get(getHomeKey(assignment.person)) ?? "grey.600",
                                    color: "common.black",
                                  }}
                                >
                                  <Box>
                                    <Typography variant="body1" sx={{ color: "common.black" }}>
                                      {assignment.person.name}
                                      {isCollapsed ? ` - ${assignment.person.role}` : ""}
                                    </Typography>
                                    {!isCollapsed && (
                                      <Typography
                                        variant="caption"
                                        sx={{ color: "common.black", opacity: 0.9 }}
                                      >
                                        {assignment.person.role} - due {assignment.person.nextDue ? formatDate(assignment.person.nextDue) : "no date"}
                                      </Typography>
                                    )}
                                  </Box>
                                  {!isCollapsed && (
                                    <Chip
                                      label={assignment.person.nextDue ? formatDate(assignment.person.nextDue) : "no date"}
                                      size="small"
                                      sx={{ bgcolor: "rgba(255,255,255,0.7)", color: "common.black" }}
                                    />
                                  )}
                                </Paper>
                              ),
                            )}
                          </Stack>
                        </Paper>
                      ))}
                    </Box>
                  </Stack>
                </Paper>
              );
            })}
            {!sessions.length && (
              <Paper sx={{ p: 2, minWidth: 320 }}>
                <Typography color="text.secondary">No sessions yet.</Typography>
              </Paper>
            )}
          </Box>
        </Box>
      </Paper>
    </Stack>
  );
}

export default TrainingSessionBuilder;

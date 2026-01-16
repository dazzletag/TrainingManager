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

import { useEffect, useMemo, useState, type DragEvent } from "react";

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

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

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

  const [publishFeedback, setPublishFeedback] = useState<PublishFeedback | null>(null);
  const [recommendFeedback, setRecommendFeedback] = useState<{ count: number; at: string } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);



  const overviewQuery = useQuery({

    queryKey: ["schedulerOverview", role],

    queryFn: () => fetchSchedulerOverview(role, userEmail).then((response) => response.data),

  });



  const sessions: SessionOverview[] = overviewQuery.data?.overview ?? [];

  const unassigned: UnassignedPerson[] = overviewQuery.data?.unassigned ?? [];

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;

  const attendeeCount = useMemo(() => {

    if (!selectedSession) return 0;

    const ids = new Set(

      [...selectedSession.day1Assignments, ...selectedSession.day2Assignments].map(

        (assignment) => assignment.person.id,

      ),

    );

    return ids.size;

  }, [selectedSession]);



  useEffect(() => {

    if (!selectedSessionId && sessions.length) {

      setSelectedSessionId(sessions[0].id);

    }

  }, [sessions, selectedSessionId]);



  const assignMutation = useMutation({

    mutationFn: (payload: { sessionId: string; personId: string; day: number; dropZoneId: string }) =>

      assignPersonToSession(payload, role, userEmail),

    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] }),

  });



  const removeMutation = useMutation({

    mutationFn: (assignmentId: string) => removeSessionAssignment(assignmentId, role, userEmail),

    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] }),

  });



  const createSessionMutation = useMutation({

    mutationFn: (payload: { name: string; type: string; day1: string; day2: string; day1StartTime: string; day1EndTime: string; day2StartTime: string; day2EndTime: string }) =>

      createTrainingSession(payload, role, userEmail),

    onSuccess: (response) => {

      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });

      setSelectedSessionId(response.data.session.id);

      setForm({ name: "", type: "Mandatory Training", day1: "", day2: "", day1StartTime: "09:15", day1EndTime: "15:45", day2StartTime: "09:15", day2EndTime: "15:45" });

    },

  });



  const publishMutation = useMutation({

    mutationFn: (sessionId: string) => publishTrainingSession(sessionId, role, userEmail),

    onSuccess: (response) => {

      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });

      setPublishFeedback({

        results: response.data.results,

        publishedAt: response.data.publishedAt,

      });

    },

  });

  const deleteSessionMutation = useMutation({

    mutationFn: (sessionId: string) => deleteTrainingSession(sessionId, role, userEmail),

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });

      setSelectedSessionId(null);

    },

  });

  const recommendMutation = useMutation({

    mutationFn: (sessionId: string) => recommendTrainingSession(sessionId, role, userEmail),

    onSuccess: (response) => {

      queryClient.invalidateQueries({ queryKey: ["schedulerOverview", role] });

      const count = response.data.recommended?.length ?? 0;

      setRecommendFeedback({ count, at: new Date().toISOString() });

    },

  });



  const homeColorMap = useMemo(() => {

    const map = new Map<string, string>();

    const homes = new Set<string>();

    unassigned.forEach((person) => homes.add(getHomeKey(person)));

    selectedSession?.day1Assignments.forEach((assignment) => homes.add(getHomeKey(assignment.person)));

    selectedSession?.day2Assignments.forEach((assignment) => homes.add(getHomeKey(assignment.person)));

    Array.from(homes).forEach((home, index) => {

      map.set(home, homeColorOverrides[home] ?? homePalette[index % homePalette.length]);

    });

    return map;

  }, [unassigned, selectedSession]);



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



  const handleDropOnDay = (event: DragEvent<HTMLDivElement>, day: number) => {

    event.preventDefault();

    if (!selectedSession) return;

    const payload = parseDragPayload(event);

    if (!payload) return;



    const dropZoneId = `session-${selectedSession.id}-day-${day}-${payload.personId}-${Date.now()}`;

    assignMutation.mutate({ sessionId: selectedSession.id, personId: payload.personId, day, dropZoneId });

  };



  const handleDropToUnassigned = (event: DragEvent<HTMLDivElement>) => {

    event.preventDefault();

    const payload = parseDragPayload(event);

    if (payload?.assignmentId) {

      removeMutation.mutate(payload.assignmentId);

    }

  };



  const formatDate = (value?: string) =>

    value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "-";



  const skippedResults = publishFeedback?.results.filter((result) => !result.moved) ?? [];

  const mandatoryUnassigned = useMemo(

    () => {

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

    },

    [unassigned],

  );



  const findPersonName = (personId: string) => {

    const assignments: SessionAssignment[] = [];

    if (selectedSession) {

      assignments.push(...selectedSession.day1Assignments, ...selectedSession.day2Assignments);

    }

    return assignments.find((assignment) => assignment.person.id === personId)?.person.name ?? personId;

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

            disabled={!form.name || !form.day1 || !form.day2 || !form.day1StartTime || !form.day1EndTime || !form.day2StartTime || !form.day2EndTime || createSessionMutation.isPending}

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

        <Typography variant="h6">Active sessions</Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" mt={2}>

          {sessions.map((session) => (

            <Button

              key={session.id}

              variant={session.id === selectedSession?.id ? "contained" : "outlined"}

              onClick={() => setSelectedSessionId(session.id)}

            >

              {session.name} · {formatDate(session.day1)} / {formatDate(session.day2)}

            </Button>

          ))}

          {!sessions.length && <Typography color="text.secondary">No sessions yet</Typography>}

        </Stack>

      </Paper>



      {selectedSession && (

        <Paper sx={{ p: 3 }}>

          <Stack direction="row" alignItems="center" justifyContent="space-between">

            <Typography variant="h6">Session {selectedSession.name} ({attendeeCount})</Typography>

            <Stack direction="row" spacing={1}>

              <Button

                variant="contained"

                disabled={publishMutation.isPending}

                onClick={() => publishMutation.mutate(selectedSession.id)}

              >

                Publish to Planday

              </Button>

              <Button

                variant="outlined"

                disabled={recommendMutation.isPending}

                onClick={() => recommendMutation.mutate(selectedSession.id)}

              >

                Recommend

              </Button>

              <Button

                variant="outlined"

                onClick={() => setIsCollapsed((prev) => !prev)}

              >

                {isCollapsed ? "Expand" : "Collapse"}

              </Button>

              <Button

                variant="outlined"

                color="error"

                disabled={deleteSessionMutation.isPending}

                onClick={() => {

                  if (!window.confirm(`Delete session ${selectedSession.name}?`)) return;

                  deleteSessionMutation.mutate(selectedSession.id);

                }}

              >

                Delete session

              </Button>

            </Stack>

          </Stack>

          {publishMutation.isError && (

            <Alert severity="error" sx={{ mt: 2 }}>

              Unable to publish the session to Planday

            </Alert>

          )}
          {recommendMutation.isError && (

            <Alert severity="error" sx={{ mt: 2 }}>

              Unable to generate recommendations

            </Alert>

          )}

          {publishFeedback && (

            <Box mt={2}>

              <Alert severity="success">

                Published {selectedSession.name} ({skippedResults.length ? "with warnings" : "all shifts moved"}) ·{" "}

                {new Date(publishFeedback.publishedAt).toLocaleTimeString()}

              </Alert>

              {skippedResults.length > 0 && (

                <Alert severity="warning" sx={{ mt: 1 }}>

                  Skipped updating {skippedResults.length} employee(s):

                  <Stack component="ul" sx={{ mt: 1, ml: 2 }}>

                    {skippedResults.map((result) => (

                      <li key={`${result.personId}-${result.day}`}>

                        {findPersonName(result.personId)} · {result.reason ?? "reason unknown"}
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
          {recommendFeedback && (

            <Alert severity="success" sx={{ mt: 2 }}>

              Recommended {recommendFeedback.count} staff for {selectedSession.name} ú{" "}

              {new Date(recommendFeedback.at).toLocaleTimeString()}

            </Alert>

          )}

          <Box

            sx={{

              mt: 2,

              display: "grid",

              gap: 2,

              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },

            }}

          >

            {[1, 2].map((day) => (

              <Paper

                key={`day-${day}`}

                onDragOver={(event) => event.preventDefault()}

                onDrop={(event) => handleDropOnDay(event, day)}

                sx={{

                  minHeight: 220,

                  p: 2,

                  border: "1px dashed",

                  borderColor: "divider",

                }}

              >

                <Typography variant="subtitle1" gutterBottom>

                  Day {day} · {day === 1 ? formatDate(selectedSession.day1) : formatDate(selectedSession.day2)}

                </Typography>

                <Stack spacing={1}>

                  {(day === 1 ? selectedSession.day1Assignments : selectedSession.day2Assignments).map(

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

                          </Typography>

                          <Typography variant="caption" sx={{ color: "common.black", opacity: 0.9 }}>

                            {isCollapsed ? assignment.person.role : `${assignment.person.role} - due ${assignment.person.nextDue ? formatDate(assignment.person.nextDue) : "no date"}` }

                          </Typography>

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

          <Paper

            sx={{ mt: 3, p: 2, backgroundColor: (theme) => theme.palette.background.default }}

            onDragOver={(event) => event.preventDefault()}

            onDrop={handleDropToUnassigned}

          >

            <Typography variant="subtitle2" color="text.secondary" mb={1}>

              Drag an assignment card here to remove it, or drag unassigned staff into the days above.

            </Typography>

            <Divider sx={{ mb: 2 }} />

            <Box

              sx={{

                display: "grid",

                gap: 2,

                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },

                maxHeight: { xs: 360, md: 420 },

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

                        {person.role} � due {person.nextDue ? formatDate(person.nextDue) : "no date"}

                      </Typography>

                    </Box>

                    <Chip

                      label={person.nextDue ? formatDate(person.nextDue) : "no date"}

                      size="small"

                      sx={{ bgcolor: "rgba(255,255,255,0.7)", color: "common.black" }}

                    />

                  </Stack>

                  <Typography variant="caption" sx={{ color: "common.black", opacity: 0.9 }}>

                    Home: {person.home} · last training {person.lastTrainingAt ? formatDate(person.lastTrainingAt) : "–"}

                  </Typography>

                </Paper>

              ))}

              {!mandatoryUnassigned.length && (

                <Typography color="text.secondary">Everyone has been allocated.</Typography>

              )}

            </Box>

          </Paper>

        </Paper>

      )}

    </Stack>

  );

}



export default TrainingSessionBuilder;


import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
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
  CircularProgress,
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
  markPersonUnavailable,
  removePersonUnavailable,
  importPlandayShifts,
  saveSessionAttendance,
} from "../services/api";
import SearchIcon from "@mui/icons-material/Search";

type DragPayload = {
  personId: string;
  assignmentId?: string;
  day?: number;
  source: "unassigned" | "day1" | "day2" | "unavailable";
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

type UnavailablePerson = UnassignedPerson & {
  reason?: string;
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
  unavailable: UnavailablePerson[];
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
const buildUnavailablePerson = (person: SessionAssignment["person"]): UnavailablePerson => ({
  id: person.id,
  externalId: person.externalId,
  name: person.name,
  role: person.role,
  home: person.home ?? "Unknown",
  primaryDepartmentId: person.primaryDepartmentId,
  status: person.status,
  employmentStatus: "unknown",
  nextDue: person.nextDue,
  lastTrainingAt: person.lastTrainingAt,
});
const MS_IN_DAY = 1000 * 60 * 60 * 24;
const DUE_WINDOW_DAYS = 90;
const DUE_WINDOW_MS = DUE_WINDOW_DAYS * MS_IN_DAY;

type TrainingSessionBuilderProps = {
  requirementId?: string;
  requirementName?: string;
};

function TrainingSessionBuilder({ requirementId, requirementName }: TrainingSessionBuilderProps = {}) {
  const { role, userEmail } = useUserContext();
  const queryClient = useQueryClient();
  const overviewKey = ["schedulerOverview", role, requirementId ?? "mandatory"];
  const defaultType = requirementName ?? "Mandatory Training";
  const [form, setForm] = useState({
    name: "",
    type: defaultType,
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
  const [pendingPersonIds, setPendingPersonIds] = useState<Set<string>>(new Set());
  const [mandatorySearch, setMandatorySearch] = useState("");
  const [showAllMandatory, setShowAllMandatory] = useState(false);

  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => fetchSchedulerOverview(role, userEmail, requirementId ? { requirementId } : undefined).then((response) => response.data),
  });

  const sessions: SessionOverview[] = overviewQuery.data?.overview ?? [];
  const unassigned: UnassignedPerson[] = overviewQuery.data?.unassigned ?? [];
  const unavailable: UnavailablePerson[] = overviewQuery.data?.unavailable ?? [];

  const assignMutation = useMutation({
    mutationFn: (payload: { sessionId: string; personId: string; day: number; dropZoneId: string }) =>
      assignPersonToSession(payload, role, userEmail),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: overviewKey });
      setPendingPersonIds((prev) => {
        const next = new Set(prev);
        next.add(payload.personId);
        return next;
      });
      const previous = queryClient.getQueryData<SchedulerOverviewData>(overviewKey);
      if (!previous) {
        return { previous, personId: payload.personId };
      }

      const personFromUnassigned = previous.unassigned.find((person) => person.id === payload.personId);
      const personFromUnavailable = previous.unavailable.find((person) => person.id === payload.personId);
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
      } else if (personFromUnavailable) {
        assignmentPerson = {
          id: personFromUnavailable.id,
          externalId: personFromUnavailable.externalId,
          name: personFromUnavailable.name,
          email: "",
          role: personFromUnavailable.role,
          home: personFromUnavailable.home,
          primaryDepartmentId: personFromUnavailable.primaryDepartmentId,
          status: personFromUnavailable.status,
          nextDue: personFromUnavailable.nextDue,
          lastTrainingAt: personFromUnavailable.lastTrainingAt,
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
      const updatedUnavailable = previous.unavailable.filter((person) => person.id !== payload.personId);

      queryClient.setQueryData<SchedulerOverviewData>(overviewKey, {
        overview: updatedOverview,
        unassigned: updatedUnassigned,
        unavailable: updatedUnavailable,
      });

      return { previous, personId: payload.personId };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(overviewKey, context.previous);
      }
    },
    onSettled: (_data, _error, _payload, context) => {
      if (context?.personId) {
        setPendingPersonIds((prev) => {
          const next = new Set(prev);
          next.delete(context.personId);
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: overviewKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => removeSessionAssignment(assignmentId, role, userEmail),
    onMutate: async (assignmentId) => {
      await queryClient.cancelQueries({ queryKey: overviewKey });
      const previous = queryClient.getQueryData<SchedulerOverviewData>(overviewKey);
      if (!previous) {
        return { previous, personId: null };
      }

      let removedPerson: UnassignedPerson | null = null;
      let removedPersonId: string | null = null;
      const updatedOverview = previous.overview.map((session) => {
        const nextDay1 = session.day1Assignments.filter((assignment) => {
          if (assignment.id === assignmentId) {
            removedPersonId = assignment.person.id;
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
            removedPersonId = assignment.person.id;
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
      if (removedPerson && removedPersonId) {
        const stillAssigned = updatedOverview.some((session) =>
          [...session.day1Assignments, ...session.day2Assignments].some(
            (assignment) => assignment.person.id === removedPersonId,
          ),
        );
        if (!stillAssigned && !updatedUnassigned.some((person) => person.id === removedPersonId)) {
          updatedUnassigned = [
            removedPerson,
            ...updatedUnassigned,
          ];
        }
      }

      queryClient.setQueryData<SchedulerOverviewData>(overviewKey, {
        overview: updatedOverview,
        unassigned: updatedUnassigned,
        unavailable: previous.unavailable,
      });

      if (removedPersonId !== null) {
        setPendingPersonIds((prev) => {
          const next = new Set(prev);
          next.add(removedPersonId as string);
          return next;
        });
      }

      return { previous, personId: removedPersonId };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(overviewKey, context.previous);
      }
    },
    onSettled: (_data, _error, _payload, context) => {
      const pendingId = context?.personId;
      if (typeof pendingId === "string") {
        setPendingPersonIds((prev) => {
          const next = new Set(prev);
          next.delete(pendingId);
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: overviewKey });
    },
  });

  const markUnavailableMutation = useMutation({
    mutationFn: (payload: { personId: string; reason?: string }) =>
      markPersonUnavailable(payload, role, userEmail),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: overviewKey });
      setPendingPersonIds((prev) => {
        const next = new Set(prev);
        next.add(payload.personId);
        return next;
      });
      const previous = queryClient.getQueryData<SchedulerOverviewData>(overviewKey);
      if (!previous) {
        return { previous, personId: payload.personId };
      }

      const personFromUnavailable = previous.unavailable.find((person) => person.id === payload.personId);
      const personFromUnassigned = previous.unassigned.find((person) => person.id === payload.personId);
      let unavailablePerson: UnavailablePerson | null = personFromUnavailable ?? personFromUnassigned ?? null;

      if (!unavailablePerson) {
        for (const session of previous.overview) {
          const assignment = [...session.day1Assignments, ...session.day2Assignments].find(
            (entry) => entry.person.id === payload.personId,
          );
          if (assignment) {
            unavailablePerson = buildUnavailablePerson(assignment.person);
            break;
          }
        }
      }

      if (!unavailablePerson) {
        return { previous, personId: payload.personId };
      }

      const updatedOverview = previous.overview.map((session) => ({
        ...session,
        day1Assignments: session.day1Assignments.filter(
          (assignment) => assignment.person.id !== payload.personId,
        ),
        day2Assignments: session.day2Assignments.filter(
          (assignment) => assignment.person.id !== payload.personId,
        ),
      }));

      const updatedUnassigned = previous.unassigned.filter((person) => person.id !== payload.personId);
      const updatedUnavailable = [
        unavailablePerson,
        ...previous.unavailable.filter((person) => person.id !== payload.personId),
      ];

      queryClient.setQueryData<SchedulerOverviewData>(overviewKey, {
        overview: updatedOverview,
        unassigned: updatedUnassigned,
        unavailable: updatedUnavailable,
      });

      return { previous, personId: payload.personId };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(overviewKey, context.previous);
      }
    },
    onSettled: (_data, _error, _payload, context) => {
      if (context?.personId) {
        setPendingPersonIds((prev) => {
          const next = new Set(prev);
          next.delete(context.personId);
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: overviewKey });
    },
  });

  const removeUnavailableMutation = useMutation({
    mutationFn: (payload: { personId: string; returnToUnassigned: boolean }) =>
      removePersonUnavailable(payload.personId, role, userEmail),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: overviewKey });
      setPendingPersonIds((prev) => {
        const next = new Set(prev);
        next.add(payload.personId);
        return next;
      });
      const previous = queryClient.getQueryData<SchedulerOverviewData>(overviewKey);
      if (!previous) {
        return { previous, personId: payload.personId };
      }

      const removedPerson = previous.unavailable.find((person) => person.id === payload.personId) ?? null;
      const updatedUnavailable = previous.unavailable.filter((person) => person.id !== payload.personId);
      const updatedUnassigned =
        payload.returnToUnassigned && removedPerson && !previous.unassigned.some((person) => person.id === removedPerson.id)
          ? [removedPerson, ...previous.unassigned]
          : previous.unassigned;

      queryClient.setQueryData<SchedulerOverviewData>(overviewKey, {
        overview: previous.overview,
        unassigned: updatedUnassigned,
        unavailable: updatedUnavailable,
      });

      return { previous, personId: payload.personId };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(overviewKey, context.previous);
      }
    },
    onSettled: (_data, _error, _payload, context) => {
      if (context?.personId) {
        setPendingPersonIds((prev) => {
          const next = new Set(prev);
          next.delete(context.personId);
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: overviewKey });
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: (payload: { name: string; type: string; day1: string; day2: string; day1StartTime: string; day1EndTime: string; day2StartTime: string; day2EndTime: string }) =>
      createTrainingSession(payload, role, userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: overviewKey });
      setForm({
        name: "",
        type: defaultType,
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

  const [importFeedback, setImportFeedback] = useState<{
    imported: Array<{
      sessionName: string;
      day1: string;
      day2: string;
      skipped: boolean;
      reason?: string;
      assignedCount: number;
    }>;
    totalShiftsFound: number;
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: () => importPlandayShifts(role, userEmail).then((response) => response.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: overviewKey });
      setImportFeedback(data);
    },
    onError: () => {
      setImportFeedback(null);
    },
  });

  type AttendanceEntry = { personId: string; name: string; day1: boolean; day2: boolean };
  const [attendanceSession, setAttendanceSession] = useState<SessionOverview | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceEntry[]>([]);
  const [attendanceConfirmOpen, setAttendanceConfirmOpen] = useState(false);
  const [attendanceSaveResult, setAttendanceSaveResult] = useState<{ updated: string[]; plandayErrors: Array<{ name: string; error: string }> } | null>(null);

  const openAttendanceDialog = (session: SessionOverview) => {
    const personMap = new Map<string, AttendanceEntry>();
    for (const a of session.day1Assignments) {
      const entry = personMap.get(a.person.id) ?? { personId: a.person.id, name: a.person.name, day1: false, day2: false };
      entry.day1 = true;
      personMap.set(a.person.id, entry);
    }
    for (const a of session.day2Assignments) {
      const entry = personMap.get(a.person.id) ?? { personId: a.person.id, name: a.person.name, day1: false, day2: false };
      entry.day2 = true;
      personMap.set(a.person.id, entry);
    }
    const sorted = Array.from(personMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    setAttendanceData(sorted);
    setAttendanceSaveResult(null);
    setAttendanceSession(session);
  };

  const attendanceMutation = useMutation({
    mutationFn: ({ sessionId, attendance }: { sessionId: string; attendance: AttendanceEntry[] }) =>
      saveSessionAttendance(sessionId, attendance, role, userEmail).then((r) => r.data),
    onSuccess: (data) => {
      setAttendanceSaveResult(data);
      setAttendanceConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: overviewKey });
    },
  });

  const handleAttendanceSave = () => {
    const incomplete = attendanceData.filter((e) => !e.day1 || !e.day2);
    if (incomplete.length > 0) {
      setAttendanceConfirmOpen(true);
    } else {
      attendanceMutation.mutate({ sessionId: attendanceSession!.id, attendance: attendanceData });
    }
  };

  const homeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const homes = new Set<string>();
    unassigned.forEach((person) => homes.add(getHomeKey(person)));
    unavailable.forEach((person) => homes.add(getHomeKey(person)));
    sessions.forEach((session) => {
      session.day1Assignments.forEach((assignment) => homes.add(getHomeKey(assignment.person)));
      session.day2Assignments.forEach((assignment) => homes.add(getHomeKey(assignment.person)));
    });
    Array.from(homes).forEach((home, index) => {
      map.set(home, homeColorOverrides[home] ?? homePalette[index % homePalette.length]);
    });
    return map;
  }, [unassigned, unavailable, sessions]);

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

  const removeAssignmentsForPerson = async (sessionId: string, personId: string, day?: number) => {
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;
    const bucket = day === 2 ? session.day2Assignments : day === 1 ? session.day1Assignments : [...session.day1Assignments, ...session.day2Assignments];
    const assignments = bucket.filter((assignment) => assignment.person.id === personId);
    if (!assignments.length) return;
    await Promise.all(assignments.map((assignment) => removeMutation.mutateAsync(assignment.id)));
  };

  const handleDropOnDay = async (event: DragEvent<HTMLDivElement>, sessionId: string, day: number) => {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;

    if (payload.sourceSessionId && payload.sourceSessionId !== sessionId) {
      await removeAssignmentsForPerson(payload.sourceSessionId, payload.personId, payload.day);
    }

    const dropZoneId = `session-${sessionId}-day-${day}-${payload.personId}-${Date.now()}`;
    assignMutation.mutate({ sessionId, personId: payload.personId, day, dropZoneId });
  };

  const handleDropToUnassigned = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;

    if (payload.source === "unavailable") {
      removeUnavailableMutation.mutate({ personId: payload.personId, returnToUnassigned: true });
      return;
    }

    if (payload.assignmentId) {
      removeMutation.mutate(payload.assignmentId);
      return;
    }

    if (payload.sourceSessionId) {
      await removeAssignmentsForPerson(payload.sourceSessionId, payload.personId, payload.day);
    }
  };

  const handleDropToUnavailable = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;
    if (payload.source === "unavailable") return;

    markUnavailableMutation.mutate({ personId: payload.personId });
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
      .filter((person) => showAllMandatory || person.status !== "compliant")
      .slice()
      .sort((a, b) => {
        const statusDelta = (statusOrder.get(a.status) ?? 99) - (statusOrder.get(b.status) ?? 99);
        if (statusDelta !== 0) return statusDelta;
        if (!a.nextDue && !b.nextDue) return 0;
        if (!a.nextDue) return 1;
        if (!b.nextDue) return -1;
        return new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime();
      });
  }, [unassigned, showAllMandatory]);

  const mandatoryDisplayList = useMemo(() => {
    const normalizedSearch = mandatorySearch.trim().toLowerCase();
    const now = new Date().getTime();
    return mandatoryUnassigned.filter((person) => {
      if (!showAllMandatory && person.nextDue) {
        const dueTime = new Date(person.nextDue).getTime();
        if (!Number.isNaN(dueTime) && dueTime - now > DUE_WINDOW_MS) {
          return false;
        }
      }
      if (!normalizedSearch) {
        return true;
      }
      const haystack = `${person.name} ${person.role} ${person.home}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [mandatoryUnassigned, mandatorySearch, showAllMandatory]);

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
          <Stack direction="row" spacing={2}>
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
            <Button
              variant="outlined"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? "Importing..." : "Import from Planday"}
            </Button>
          </Stack>
        </Stack>
        {createSessionMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Unable to create session
          </Alert>
        )}
        {importMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Failed to import shifts from Planday
          </Alert>
        )}
        {importFeedback && (
          <Alert
            severity={importFeedback.imported.length ? "success" : "info"}
            sx={{ mt: 2 }}
            onClose={() => setImportFeedback(null)}
          >
            {importFeedback.totalShiftsFound === 0 ? (
              "No future mandatory training shifts found in Planday."
            ) : (
              <>
                Found {importFeedback.totalShiftsFound} shift(s) in Planday.
                {importFeedback.imported.map((entry, idx) => (
                  <Box key={idx} sx={{ mt: 0.5 }}>
                    {entry.skipped ? (
                      <Typography variant="body2">
                        Skipped {entry.sessionName}: {entry.reason}
                      </Typography>
                    ) : (
                      <Typography variant="body2">
                        Created {entry.sessionName} ({entry.day1} / {entry.day2}) with {entry.assignedCount} staff assigned
                      </Typography>
                    )}
                  </Box>
                ))}
              </>
            )}
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
            <Typography variant="h6">{defaultType} sessions</Typography>
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
          <Stack spacing={2}>
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
            <Box
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "flex-end",
                flexWrap: "wrap",
                mb: 1,
              }}
            >
              <TextField
                label="Search staff"
                size="small"
                value={mandatorySearch}
                onChange={(event) => setMandatorySearch(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              {mandatorySearch && (
                <Button size="small" onClick={() => setMandatorySearch("")}>
                  Clear
                </Button>
              )}
            </Box>
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
              {mandatoryDisplayList.map((person) => (
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
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={person.nextDue ? formatDate(person.nextDue) : "no date"}
                        size="small"
                        sx={{ bgcolor: "rgba(255,255,255,0.7)", color: "common.black" }}
                      />
                      {pendingPersonIds.has(person.id) && (
                        <CircularProgress size={12} sx={{ color: "common.black" }} />
                      )}
                    </Stack>
                  </Stack>
                  {!isCollapsed && (
                    <Typography variant="caption" sx={{ color: "common.black", opacity: 0.9 }}>
                      Home: {person.home} - last training {person.lastTrainingAt ? formatDate(person.lastTrainingAt) : "-"}
                    </Typography>
                  )}
                </Paper>
              ))}
              {!mandatoryDisplayList.length && (
                <Typography color="text.secondary">
                  {mandatoryUnassigned.length
                    ? "No staff match the filters. Try showing all staff."
                    : "Everyone has been allocated."}
                </Typography>
              )}
            </Box>
            <Box mt={1} sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button size="small" variant="text" onClick={() => setShowAllMandatory((prev) => !prev)}>
                {showAllMandatory ? "Limit to staff due in 90 days" : "Show all staff"}
              </Button>
            </Box>
          </Paper>

            <Paper
              sx={{
                p: 2,
                backgroundColor: (theme) => theme.palette.background.default,
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDropToUnavailable}
            >
              <Typography variant="subtitle1" mb={1}>
                Unavailable staff
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>
                Drop staff here to exclude them from sessions (maternity leave, sickness).
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: "1fr",
                  maxHeight: { xs: 240, lg: 320 },
                  overflowY: "auto",
                  pr: 1,
                }}
              >
                {unavailable.map((person) => (
                  <Paper
                    key={person.id}
                    draggable
                    onDragStart={(event) =>
                      handleDragStart(event, { personId: person.id, source: "unavailable" })
                    }
                    sx={{
                      px: 2,
                      py: isCollapsed ? 0.6 : 1,
                      borderRight: "7px solid #8b0000",
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
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={person.nextDue ? formatDate(person.nextDue) : "no date"}
                          size="small"
                          sx={{ bgcolor: "rgba(255,255,255,0.7)", color: "common.black" }}
                        />
                        {pendingPersonIds.has(person.id) && (
                          <CircularProgress size={12} sx={{ color: "common.black" }} />
                        )}
                      </Stack>
                    </Stack>
                    {!isCollapsed && (
                      <Typography variant="caption" sx={{ color: "common.black", opacity: 0.9 }}>
                        Home: {person.home} - last training {person.lastTrainingAt ? formatDate(person.lastTrainingAt) : "-"}
                      </Typography>
                    )}
                  </Paper>
                ))}
                {!unavailable.length && (
                  <Typography color="text.secondary">No unavailable staff saved.</Typography>
                )}
              </Box>
            </Paper>
          </Stack>

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
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => openAttendanceDialog(session)}
                      >
                        Attendance
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
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    {!isCollapsed && (
                                      <Chip
                                        label={assignment.person.nextDue ? formatDate(assignment.person.nextDue) : "no date"}
                                        size="small"
                                        sx={{ bgcolor: "rgba(255,255,255,0.7)", color: "common.black" }}
                                      />
                                    )}
                                    {pendingPersonIds.has(assignment.person.id) && (
                                      <CircularProgress size={12} sx={{ color: "common.black" }} />
                                    )}
                                  </Stack>
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
      {/* Attendance register dialog */}
      <Dialog open={Boolean(attendanceSession)} onClose={() => setAttendanceSession(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Attendance Register — {attendanceSession?.name}
          <Typography variant="body2" color="text.secondary">
            {attendanceSession ? `Day 1: ${formatDate(attendanceSession.day1)} / Day 2: ${formatDate(attendanceSession.day2)}` : ""}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {attendanceSaveResult ? (
            <Stack spacing={1}>
              {attendanceSaveResult.updated.length > 0 && (
                <Alert severity="success">
                  Updated records for: {attendanceSaveResult.updated.join(", ")}
                </Alert>
              )}
              {attendanceSaveResult.plandayErrors.length > 0 && (
                <Alert severity="warning">
                  Planday update failed for: {attendanceSaveResult.plandayErrors.map((e) => `${e.name} (${e.error})`).join("; ")}
                </Alert>
              )}
            </Stack>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell align="center">Day 1</TableCell>
                  <TableCell align="center">Day 2</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {attendanceData.map((entry) => (
                  <TableRow key={entry.personId} sx={{ bgcolor: (!entry.day1 || !entry.day2) ? "warning.50" : undefined }}>
                    <TableCell>{entry.name}</TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={entry.day1}
                        onChange={(e) =>
                          setAttendanceData((prev) =>
                            prev.map((item) => item.personId === entry.personId ? { ...item, day1: e.target.checked } : item)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={entry.day2}
                        onChange={(e) =>
                          setAttendanceData((prev) =>
                            prev.map((item) => item.personId === entry.personId ? { ...item, day2: e.target.checked } : item)
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!attendanceData.length && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography color="text.secondary">No attendees assigned to this session.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {attendanceMutation.isError && (
            <Alert severity="error" sx={{ mt: 1 }}>Failed to save attendance records.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttendanceSession(null)}>Close</Button>
          {!attendanceSaveResult && (
            <Button
              variant="contained"
              disabled={attendanceMutation.isPending || !attendanceData.length}
              onClick={handleAttendanceSave}
            >
              {attendanceMutation.isPending ? "Saving..." : "Save attendance"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Confirmation dialog for incomplete attendance */}
      <Dialog open={attendanceConfirmOpen} onClose={() => setAttendanceConfirmOpen(false)} maxWidth="sm">
        <DialogTitle>Incomplete attendance</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            The following attendees have not completed both days and will NOT have their records updated:
          </Typography>
          <Stack component="ul" sx={{ mt: 1, pl: 2 }}>
            {attendanceData.filter((e) => !e.day1 || !e.day2).map((e) => (
              <li key={e.personId}>
                <Typography variant="body2">
                  {e.name} {!e.day1 && !e.day2 ? "(neither day)" : !e.day1 ? "(missed Day 1)" : "(missed Day 2)"}
                </Typography>
              </li>
            ))}
          </Stack>
          <Typography sx={{ mt: 2 }}>
            Only those who attended both days will have their Training Manager and Planday records updated. Is this correct?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttendanceConfirmOpen(false)}>Go back</Button>
          <Button
            variant="contained"
            disabled={attendanceMutation.isPending}
            onClick={() => attendanceMutation.mutate({ sessionId: attendanceSession!.id, attendance: attendanceData })}
          >
            Confirm and save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default TrainingSessionBuilder;

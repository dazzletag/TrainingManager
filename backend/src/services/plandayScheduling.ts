import { getPlandayHeaders, plandaySchedulingClient } from "./plandaySync";

// trainingShiftNotePrefix reserved for future use
// const trainingShiftNotePrefix = process.env.PLANDAY_TRAINING_SHIFT_NOTE_PREFIX ?? "Training Session";
const trainingShiftStartHour = Number(process.env.PLANDAY_TRAINING_SHIFT_START_HOUR ?? 9);
const trainingShiftEndHour = Number(process.env.PLANDAY_TRAINING_SHIFT_END_HOUR ?? 17);
const trainingDepartmentId = process.env.PLANDAY_TRAINING_SHIFT_DEPARTMENT_ID ?? "7770";
const trainingShiftTypeId = process.env.PLANDAY_TRAINING_SHIFT_TYPE_ID ?? "71233";

const holidayStatuses = new Set(["approved", "confirmed", "holiday", "paid"]);

interface ShiftWindow {
  start: Date;
  end: Date;
}

interface PublishResult {
  personId: string;
  day: number;
  moved: boolean;
  reason?: string;
  debug?: {
    step: "unassign" | "create";
    request: {
      method: string;
      url: string;
      payload: Record<string, unknown>;
    };
    response?: {
      status: number;
      data: unknown;
    };
    details?: Record<string, unknown>;
  };
}

interface PlandayShift {
  id: string;
  startDateTime: string;
  endDateTime: string;
  date?: string;
  comment?: string;
  employeeId?: string;
  punchClockShiftId?: string;
  status?: string;
  dateTimeCreated?: string;
  dateTimeModified?: string;
  skillIds?: string[];
  departmentId?: string;
  employeeGroupId?: string;
  positionId?: string;
  shiftTypeId?: string;
}

interface PlandayAbsence {
  id: string;
  status: string;
  startDateTime: string;
  endDateTime: string;
}

function parseTime(value?: string) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function buildShiftWindow(targetDate: Date, startTime?: string, endTime?: string): ShiftWindow {
  const start = new Date(targetDate);
  const end = new Date(targetDate);
  const startParts = parseTime(startTime);
  const endParts = parseTime(endTime);
  if (startParts) {
    start.setHours(startParts.hours, startParts.minutes, 0, 0);
  } else {
    start.setHours(trainingShiftStartHour, 0, 0, 0);
  }
  if (endParts) {
    end.setHours(endParts.hours, endParts.minutes, 0, 0);
  } else {
    end.setHours(trainingShiftEndHour, 0, 0, 0);
  }
  return { start, end };
}

function iso(dt: Date): string {
  return dt.toISOString();
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLocal(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 429 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

function stripUndefined<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function getShiftDate(shift: PlandayShift): string | undefined {
  if (shift.startDateTime) {
    const date = shift.startDateTime.split("T")[0];
    if (date) return date;
  }
  return shift.date;
}

async function isOnHoliday(externalId: string, window: ShiftWindow): Promise<boolean> {
  const headers = await getPlandayHeaders();
  if (!headers.Authorization) {
    return false;
  }

  try {
    const response = await withRetry(() =>
      plandaySchedulingClient.get<{ data: PlandayAbsence[] }>("/absences", {
        params: {
          employeeId: externalId,
          startDateTime: iso(window.start),
          endDateTime: iso(window.end),
        },
        headers,
      }),
    );
    const absences = response.data?.data ?? [];
    return absences.some((absence) =>
      holidayStatuses.has(absence.status?.toLowerCase() ?? ""),
    );
  } catch (error) {
    const status = (error as any)?.response?.status;
    if (status === 404) {
      return false;
    }
    console.warn("Unable to read absences for", externalId, error);
    return false;
  }
}

async function unassignExistingShifts(
  externalId: string,
  window: ShiftWindow,
): Promise<{ ok: boolean; employeeGroupId?: string; debug?: PublishResult["debug"] }> {
  const headers = await getPlandayHeaders();
  if (!headers.Authorization) {
    return { ok: false };
  }
  const windowDate = window.start.toISOString().split("T")[0];
  const lookupUrl = `${plandaySchedulingClient.defaults.baseURL ?? ""}/shifts`;
  const lookupParams = {
    employeeId: externalId,
    from: windowDate,
    to: windowDate,
  };
  try {
    const response = await withRetry(() =>
      plandaySchedulingClient.get<{ data: PlandayShift[] }>("/shifts", {
        params: lookupParams,
        headers,
      }),
    );

    const shifts = response.data?.data ?? [];
    if (!shifts.length) {
      return { ok: true };
    }
    const employeeGroupId = shifts[0]?.employeeGroupId;
    for (const shift of shifts) {
      const payload = stripUndefined({
        allowConflicts: false,
        comment: "Set to open for Mandatory Training",
        date: getShiftDate(shift),
        employeeGroupId: shift.employeeGroupId,
        employeeId: "",
        endDateTime: shift.endDateTime,
        startDateTime: shift.startDateTime,
      });
      const updateUrl = `${plandaySchedulingClient.defaults.baseURL ?? ""}/shifts/${shift.id}`;
      console.info("Planday shift update", { shiftId: shift.id, payload });
      try {
        await withRetry(() =>
          plandaySchedulingClient.put(`/shifts/${shift.id}`, payload, { headers }),
        );
      } catch (error: any) {
        return {
          ok: false,
          debug: {
            step: "unassign",
            request: {
              method: "PUT",
              url: updateUrl,
              payload,
            },
            response: error?.response
              ? {
                  status: error.response.status,
                  data: error.response.data,
                }
              : undefined,
            details: {
              lookup: {
                method: "GET",
                url: lookupUrl,
                payload: lookupParams,
              },
              shiftId: shift.id,
            },
          },
        };
      }
      console.info("Planday shift update succeeded", { shiftId: shift.id });
    }
    return { ok: true, employeeGroupId };
  } catch (error: any) {
    console.warn("Unable to unassign existing shifts for", externalId, error);
    return {
      ok: false,
      debug: {
        step: "unassign",
        request: {
          method: "GET",
          url: lookupUrl,
          payload: lookupParams,
        },
        response: error?.response
          ? {
              status: error.response.status,
              data: error.response.data,
            }
          : undefined,
      },
    };
  }
}

async function createTrainingShift(
  externalId: string,
  window: ShiftWindow,
  _sessionName: string,
  _sessionId: string,
  _day: number,
  employeeGroupId?: string,
  positionId?: string,
): Promise<void> {
  const headers = await getPlandayHeaders();
  if (!headers.Authorization) {
    return;
  }

  const payload = stripUndefined({
    allowConflicts: false,
    date: formatDateLocal(window.start),
    comment: "mandatory training",
    shiftTypeId: trainingShiftTypeId,
    departmentId: trainingDepartmentId,
    startTime: formatTimeLocal(window.start),
    endTime: formatTimeLocal(window.end),
    useBreaks: true,
    employeeGroupId,
    positionId,
    employeeId: externalId,
  });
  await withRetry(() =>
    plandaySchedulingClient.post("/shifts", payload, { headers }),
  );
}

function resolveEmployeeGroupId(
  employeeGroupId: string | undefined,
  home?: string,
): string | undefined {
  if (employeeGroupId) return employeeGroupId;
  switch ((home ?? "").trim()) {
    case "Quarry House":
      return "21754";
    case "Beech House":
      return "21752";
    case "Field House":
      return "21755";
    case "Glebe House":
      return "21753";
    case "Head Office":
      return "20391";
    default:
      return undefined;
  }
}

function resolveTrainingPositionId(home?: string): string | undefined {
  switch ((home ?? "").trim()) {
    case "Quarry House":
      return "20843";
    case "Beech House":
      return "20842";
    case "Field House":
      return "20845";
    case "Glebe House":
      return "20728";
    default:
      return undefined;
  }
}

export async function fetchMandatoryTrainingShifts(): Promise<
  Array<{
    id: string;
    date: string;
    employeeId: string;
    startTime: string;
    endTime: string;
    comment: string;
  }>
> {
  const headers = await getPlandayHeaders();
  if (!headers.Authorization) {
    throw new Error("Planday access token unavailable");
  }

  const today = formatDateLocal(new Date());
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const to = formatDateLocal(futureDate);

  const allShifts: PlandayShift[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const response = await withRetry(() =>
      plandaySchedulingClient.get<{ data: PlandayShift[]; paging?: { total: number } }>("/shifts", {
        params: {
          departmentId: trainingDepartmentId,
          from: today,
          to,
          limit,
          offset,
        },
        headers,
      }),
    );

    const batch = response.data?.data ?? [];
    allShifts.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return allShifts
    .filter(
      (shift) =>
        shift.comment?.toLowerCase().includes("mandatory") && shift.employeeId,
    )
    .map((shift) => ({
      id: String(shift.id),
      date: getShiftDate(shift) ?? "",
      employeeId: String(shift.employeeId),
      startTime: shift.startDateTime?.split("T")[1]?.substring(0, 5) ?? "09:15",
      endTime: shift.endDateTime?.split("T")[1]?.substring(0, 5) ?? "15:45",
      comment: shift.comment ?? "",
    }))
    .filter((shift) => shift.date !== "");
}

export async function assignToTrainingShift(
  personId: string,
  externalId: string,
  sessionName: string,
  sessionId: string,
  day: number,
  date: Date,
  startTime?: string,
  endTime?: string,
  home?: string,
): Promise<PublishResult> {
  const window = buildShiftWindow(date, startTime, endTime);

  const headers = await getPlandayHeaders();
  if (!headers.Authorization) {
    return {
      personId,
      day,
      moved: false,
      reason: "Planday access token unavailable",
    };
  }

  try {
    const holiday = await isOnHoliday(externalId, window);
    if (holiday) {
    return {
      personId,
      day,
      moved: false,
      reason: "Employee is on holiday",
    };
    }

    const unassigned = await unassignExistingShifts(externalId, window);
    if (!unassigned.ok) {
      return {
        personId,
        day,
        moved: false,
        reason: "Unable to unassign existing shifts",
        debug: unassigned.debug,
      };
    }
    const resolvedEmployeeGroupId = resolveEmployeeGroupId(
      unassigned.employeeGroupId,
      home,
    );
    const resolvedPositionId = resolveTrainingPositionId(home);
    if (!resolvedEmployeeGroupId) {
      return {
        personId,
        day,
        moved: false,
        reason: "Employee group id unavailable for training shift",
      };
    }
    try {
      await createTrainingShift(
        externalId,
        window,
        sessionName,
        sessionId,
        day,
        resolvedEmployeeGroupId,
        resolvedPositionId,
      );
    } catch (error: any) {
      const createUrl = `${plandaySchedulingClient.defaults.baseURL ?? ""}/shifts`;
      return {
        personId,
        day,
        moved: false,
        reason: "Unable to create training shift",
        debug: {
          step: "create",
          request: {
            method: "POST",
            url: createUrl,
            payload: stripUndefined({
              allowConflicts: false,
              date: formatDateLocal(window.start),
              comment: "mandatory training",
              shiftTypeId: trainingShiftTypeId,
              departmentId: trainingDepartmentId,
              startTime: formatTimeLocal(window.start),
              endTime: formatTimeLocal(window.end),
              useBreaks: true,
              employeeGroupId: resolvedEmployeeGroupId,
              positionId: resolvedPositionId,
              employeeId: externalId,
            }),
          },
          response: error?.response
            ? {
                status: error.response.status,
                data: error.response.data,
              }
            : undefined,
        },
      };
    }

    return {
      personId,
      day,
      moved: true,
    };
  } catch (error) {
    console.error("Planday shift change failed", externalId, error);
    return {
      personId,
      day,
      moved: false,
      reason: "Unable to update Planday shift",
    };
  }
}

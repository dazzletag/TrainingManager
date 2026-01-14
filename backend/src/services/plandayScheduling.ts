import { plandayClient } from "./plandaySync";

const trainingPositionId = process.env.PLANDAY_TRAINING_SHIFT_POSITION_ID;
const trainingShiftNotePrefix = process.env.PLANDAY_TRAINING_SHIFT_NOTE_PREFIX ?? "Training Session";
const trainingShiftStartHour = Number(process.env.PLANDAY_TRAINING_SHIFT_START_HOUR ?? 9);
const trainingShiftEndHour = Number(process.env.PLANDAY_TRAINING_SHIFT_END_HOUR ?? 17);

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
}

interface PlandayShift {
  id: string;
  startDateTime: string;
  endDateTime: string;
}

interface PlandayAbsence {
  id: string;
  status: string;
  startDateTime: string;
  endDateTime: string;
}

function buildShiftWindow(targetDate: Date): ShiftWindow {
  const start = new Date(targetDate);
  start.setHours(trainingShiftStartHour, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(trainingShiftEndHour, 0, 0, 0);
  return { start, end };
}

function iso(dt: Date): string {
  return dt.toISOString();
}

async function isOnHoliday(externalId: string, window: ShiftWindow): Promise<boolean> {
  if (!process.env.PLANDAY_API_TOKEN) {
    return false;
  }

  try {
    const response = await plandayClient.get<{ data: PlandayAbsence[] }>("/absences", {
      params: {
        employeeId: externalId,
        startDateTime: iso(window.start),
        endDateTime: iso(window.end),
      },
    });
    const absences = response.data?.data ?? [];
    return absences.some((absence) =>
      holidayStatuses.has(absence.status?.toLowerCase() ?? ""),
    );
  } catch (error) {
    console.warn("Unable to read absences for", externalId, error);
    return false;
  }
}

async function removeExistingShifts(externalId: string, window: ShiftWindow): Promise<void> {
  if (!process.env.PLANDAY_API_TOKEN) {
    return;
  }
  try {
    const response = await plandayClient.get<{ data: PlandayShift[] }>("/shifts", {
      params: {
        employeeId: externalId,
        startDateTime: iso(window.start),
        endDateTime: iso(window.end),
      },
    });

    const shifts = response.data?.data ?? [];
    await Promise.all(
      shifts.map((shift) => plandayClient.delete(`/shifts/${shift.id}`)),
    );
  } catch (error) {
    console.warn("Unable to delete existing shifts for", externalId, error);
  }
}

async function createTrainingShift(
  externalId: string,
  window: ShiftWindow,
  sessionName: string,
  sessionId: string,
  day: number,
): Promise<void> {
  if (!plandayClient.defaults.headers || !plandayClient.defaults.headers.Authorization) {
    return;
  }

  if (!trainingPositionId) {
    throw new Error("PLANDAY_TRAINING_SHIFT_POSITION_ID is not configured");
  }

  await plandayClient.post("/shifts", {
    employeeId: externalId,
    positionId: trainingPositionId,
    startDateTime: iso(window.start),
    endDateTime: iso(window.end),
    note: `${trainingShiftNotePrefix} - ${sessionName} (Day ${day})`,
    shiftType: "training",
    metadata: {
      sessionId,
      day,
    },
  });
}

export async function assignToTrainingShift(
  personId: string,
  externalId: string,
  sessionName: string,
  sessionId: string,
  day: number,
  date: Date,
): Promise<PublishResult> {
  const window = buildShiftWindow(date);

  if (!process.env.PLANDAY_API_TOKEN) {
    return {
      personId,
      day,
      moved: false,
      reason: "Planday credentials missing",
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

    await removeExistingShifts(externalId, window);
    await createTrainingShift(externalId, window, sessionName, sessionId, day);

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

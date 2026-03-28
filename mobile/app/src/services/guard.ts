import { api, getApiErrorMessage } from '../lib/api';
import { buildSingleFileFormData } from '../lib/multipart';
import { FlatOption, GuardShift, IncidentPayload, SecurityIncident, StaffMember, VisitorLog, WalkInPayload } from '../types/guard';

type VisitorLogsResponse = {
  success: boolean;
  message?: string;
  logs: VisitorLog[];
};

type GuardShiftsResponse = {
  success: boolean;
  message?: string;
  shifts: GuardShift[];
};

type IncidentsResponse = {
  success: boolean;
  message?: string;
  incidents: SecurityIncident[];
};

type StaffDirectoryResponse = {
  success: boolean;
  message?: string;
  staff: StaffMember[];
};

type StaffMetaResponse = {
  success: boolean;
  message?: string;
  meta?: {
    flats?: FlatOption[];
  };
};

type UploadPhotoResponse = {
  success: boolean;
  message?: string;
  file?: {
    file_name?: string;
    file_path: string;
    url?: string;
  };
};

export async function fetchVisitorLogs() {
  try {
    const response = await api.get<VisitorLogsResponse>('/visitors/logs?limit=100');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load visitor movement.'),
      logs: [],
    };
  }
}

export async function fetchGuardShifts() {
  try {
    const response = await api.get<GuardShiftsResponse>('/security/shifts');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load guard shifts.'),
      shifts: [],
    };
  }
}

export async function fetchIncidents() {
  try {
    const response = await api.get<IncidentsResponse>('/security/incidents');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load security incidents.'),
      incidents: [],
    };
  }
}

export async function fetchStaffDirectory() {
  try {
    const response = await api.get<StaffDirectoryResponse>('/staff');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load staff directory.'),
      staff: [],
    } satisfies StaffDirectoryResponse;
  }
}

export async function fetchSocietyFlats() {
  try {
    const response = await api.get<StaffMetaResponse>('/staff/meta');
    return {
      success: Boolean(response.data.success),
      message: response.data.message,
      flats: response.data.meta?.flats || [],
    };
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load society flats.'),
      flats: [],
    };
  }
}

export async function startShift(shiftId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>(`/security/shifts/${shiftId}/start`, {});
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to start shift.'),
    };
  }
}

export async function endShift(shiftId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>(`/security/shifts/${shiftId}/end`, {});
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to end shift.'),
    };
  }
}

export async function logQuickActivity(actionType: 'Patrol' | 'Mistake', description: string) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/security/activity', {
      action_type: actionType,
      description,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to log activity.'),
    };
  }
}

export async function checkInWithPasscode(passcode: string) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/visitors/check-in', {
      passcode,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to check visitor in.'),
    };
  }
}

export async function checkInApprovedVisitor(logId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/visitors/check-in', {
      log_id: logId,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to check visitor in.'),
    };
  }
}

export async function checkOutVisitor(logId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/visitors/check-out', {
      log_id: logId,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to check visitor out.'),
    };
  }
}

export async function callResidentForVisitor(logId: number) {
  try {
    const response = await api.post<{
      success: boolean;
      message?: string;
      twilio_number?: string;
    }>('/visitors/call-resident', {
      log_id: logId,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to start the masked resident call.'),
    };
  }
}

export async function createWalkInVisitor(payload: WalkInPayload) {
  try {
    const response = await api.post<{
      success: boolean;
      message?: string;
      approval_required?: boolean;
      sms_fallback?: { sent?: number };
    }>('/visitors/walk-in', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to log walk-in visitor.'),
    };
  }
}

export async function createIncident(payload: IncidentPayload) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/security/incidents', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to report incident.'),
    };
  }
}

export async function logStaffEntry(staffId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/staff/log-entry', {
      staff_id: staffId,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to log staff entry.'),
    };
  }
}

export async function logStaffExit(staffId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>('/staff/log-exit', {
      staff_id: staffId,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to log staff exit.'),
    };
  }
}

export async function uploadVisitorPhoto(file: {
  uri: string;
  name?: string;
  type?: string;
}) {
  try {
    const formData = buildSingleFileFormData('file', file, `visitor-${Date.now()}.jpg`);

    const response = await api.post<UploadPhotoResponse>('/visitors/upload/photo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to upload visitor photo.'),
    } satisfies UploadPhotoResponse;
  }
}

import { api, getApiErrorMessage } from '../lib/api';
import { buildSingleFileFormData } from '../lib/multipart';
import {
  BookingPayload,
  BillingSummary,
  CommitteeDirectoryItem,
  CommunicationConversation,
  CommunicationThreadMessage,
  ComplaintCategory,
  ComplaintDetail,
  ComplaintPayload,
  ComplaintSummaryItem,
  EventItem,
  Facility,
  FacilityBooking,
  FacilityMaintenanceBlock,
  Invoice,
  NoticeItem,
  PollItem,
  ResidentFlat,
  ResidentImportantContacts,
  ResidentStaffDirectoryItem,
  SharedDocument,
  VisitorLog,
  VisitorPassPayload,
} from '../types/resident';

type BasicResponse = { success: boolean; message?: string };

export async function fetchResidentFlats() {
  try {
    const response = await api.get<{ success: boolean; flats: ResidentFlat[] }>('/residents/me/flats');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load your flats.'), flats: [] };
  }
}

export async function fetchImportantContacts() {
  try {
    const response = await api.get<{ success: boolean; contacts: ResidentImportantContacts }>('/residents/me/important-contacts');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load important contacts.'),
      contacts: { admins: [], managers: [], service_staff: [] },
    };
  }
}

export async function fetchVisitorLogs() {
  try {
    const response = await api.get<{ success: boolean; logs: VisitorLog[] }>('/visitors/logs?limit=50');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load visitor activity.'), logs: [] };
  }
}

export async function fetchPendingApprovals() {
  try {
    const response = await api.get<{ success: boolean; approvals: VisitorLog[] }>('/visitors/pending');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load pending approvals.'), approvals: [] };
  }
}

export async function preApproveVisitor(payload: VisitorPassPayload) {
  try {
    const response = await api.post<{ success: boolean; message?: string; passcode?: string }>('/visitors/pre-approve', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to generate visitor pass.') };
  }
}

export async function approveVisitor(logId: number) {
  try {
    const response = await api.post<BasicResponse>(`/visitors/approve/${logId}`, {});
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to approve visitor.') };
  }
}

export async function denyVisitor(logId: number) {
  try {
    const response = await api.post<BasicResponse>(`/visitors/deny/${logId}`, {});
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to deny visitor.') };
  }
}

export async function fetchInvoices() {
  try {
    const response = await api.get<{ success: boolean; invoices: Invoice[] }>('/billing');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load billing overview.'), invoices: [] };
  }
}

export async function fetchBillingSummary() {
  try {
    const response = await api.get<{ success: boolean; summary: BillingSummary }>('/billing/summary');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load billing summary.') };
  }
}

export async function payInvoice(invoiceId: number, payload?: { amount?: number; payment_method?: string; payment_reference?: string }) {
  try {
    const response = await api.post<BasicResponse>(`/billing/${invoiceId}/pay`, payload || {});
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to process invoice payment.') };
  }
}

export async function fetchComplaintCategories() {
  try {
    const response = await api.get<{ success: boolean; categories: ComplaintCategory[] }>('/complaints/categories');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load complaint categories.'), categories: [] };
  }
}

export async function fetchComplaints() {
  try {
    const response = await api.get<{ success: boolean; complaints: ComplaintSummaryItem[] }>('/complaints');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load complaints.'), complaints: [] };
  }
}

export async function fetchComplaintDetail(complaintId: number) {
  try {
    const response = await api.get<{ success: boolean } & ComplaintDetail>(`/complaints/${complaintId}`);
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load complaint thread.') } as { success: false; message: string };
  }
}

export async function createComplaint(payload: ComplaintPayload) {
  try {
    const response = await api.post<BasicResponse>('/complaints', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to create complaint.') };
  }
}

export async function addComplaintMessage(
  complaintId: number,
  payload: { message: string; attachments: Array<{ file_name?: string; file_path: string; url?: string }> },
) {
  try {
    const response = await api.post<BasicResponse>(`/complaints/${complaintId}/messages`, payload);
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to post complaint update.') };
  }
}

export async function closeComplaint(complaintId: number, payload?: { note?: string }) {
  try {
    const response = await api.post<BasicResponse>(`/complaints/${complaintId}/close`, payload || {});
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to close this ticket.') };
  }
}

export async function uploadComplaintAttachment(file: { uri: string; name?: string; type?: string }) {
  try {
    const formData = buildSingleFileFormData('file', file, `complaint-${Date.now()}.jpg`);

    const response = await api.post<{
      success: boolean;
      message?: string;
      file?: { file_name?: string; file_path: string; url?: string };
    }>('/complaints/upload/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to upload attachment.') };
  }
}

export async function fetchFacilities() {
  try {
    const response = await api.get<{ success: boolean; facilities: Facility[] }>('/facilities');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load facilities.'), facilities: [] };
  }
}

export async function fetchFacilityBookings() {
  try {
    const response = await api.get<{ success: boolean; bookings: FacilityBooking[] }>('/facilities/bookings');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load bookings.'), bookings: [] };
  }
}

export async function fetchFacilityAvailability(facilityId: number, dateFrom: string, dateTo: string) {
  try {
    const response = await api.get<{
      success: boolean;
      bookings: FacilityBooking[];
      maintenance_blocks: FacilityMaintenanceBlock[];
    }>(`/facilities/availability?facility_id=${facilityId}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to load facility availability.'),
      bookings: [],
      maintenance_blocks: [],
    };
  }
}

export async function createFacilityBooking(payload: BookingPayload) {
  try {
    const response = await api.post<BasicResponse>('/facilities/bookings', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to reserve facility.') };
  }
}

export async function cancelFacilityBooking(bookingId: number) {
  try {
    const response = await api.put<BasicResponse>(`/facilities/bookings/${bookingId}`, { status: 'Cancelled' });
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to cancel booking.') };
  }
}

export async function fetchCommitteeDirectory() {
  try {
    const response = await api.get<{ success: boolean; committees: CommitteeDirectoryItem[] }>('/committees/public');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load committee directory.'), committees: [] };
  }
}

export async function fetchNotices() {
  try {
    const response = await api.get<{ success: boolean; notices: NoticeItem[] }>('/communication/notices');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load society notices.'), notices: [] };
  }
}

export async function fetchCommunicationPolls() {
  try {
    const response = await api.get<{ success: boolean; polls: PollItem[] }>('/communication/polls');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load resident polls.'), polls: [] };
  }
}

export async function submitPollResponse(pollId: number, optionId: number) {
  try {
    const response = await api.post<{ success: boolean; message?: string; option_id?: number; response_count?: number }>(
      `/communication/polls/${pollId}/respond`,
      { option_id: optionId },
    );
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to submit poll response.') };
  }
}

export async function fetchCommunicationEvents() {
  try {
    const response = await api.get<{ success: boolean; events: EventItem[] }>('/communication/events');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load community events.'), events: [] };
  }
}

export async function fetchCommunicationConversations() {
  try {
    const response = await api.get<{ success: boolean; conversations: CommunicationConversation[] }>('/communication/messages');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load admin updates.'), conversations: [] };
  }
}

export async function fetchCommunicationThread(userId: number) {
  try {
    const response = await api.get<{ success: boolean; messages: CommunicationThreadMessage[] }>(`/communication/messages/thread/${userId}`);
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load update thread.'), messages: [] };
  }
}

export async function fetchSharedDocuments() {
  try {
    const response = await api.get<{ success: boolean; documents: SharedDocument[] }>('/communication/documents');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load shared documents.'), documents: [] };
  }
}

export async function fetchResidentStaffDirectory() {
  try {
    const response = await api.get<{ success: boolean; staff: ResidentStaffDirectoryItem[] }>('/staff/directory');
    return response.data;
  } catch (error) {
    return { success: false, message: getApiErrorMessage(error, 'Unable to load staff directory.'), staff: [] };
  }
}

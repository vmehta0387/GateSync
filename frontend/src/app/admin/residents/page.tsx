'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle2, X, UploadCloud, Download, Edit2, Ban, Trash2, FileSpreadsheet, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ResidentDirectoryItem = {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  status: string;
  kyc_status: 'Pending' | 'Verified' | 'Rejected';
  flat_id: number | null;
  occupancy_type: string;
  block_name: string | null;
  flat_number: string | null;
};

type SortKey = 'name' | 'block_name' | 'occupancy_type' | 'status' | 'kyc_status';

type CsvRecord = Record<string, string>;

const BULK_IMPORT_HEADERS = [
  'name',
  'email',
  'phone_number',
  'block_name',
  'flat_number',
  'flat_type',
  'occupancy_type',
  'move_in_date',
  'move_out_date',
  'id_type',
  'id_number',
  'id_proof_url',
  'emergency_name',
  'emergency_relation',
  'emergency_phone',
  'push_notifications',
  'sms_alerts',
  'whatsapp_alerts',
  'can_approve_visitors',
  'can_view_bills',
  'can_raise_complaints',
  'vehicle_1_type',
  'vehicle_1_number',
  'vehicle_1_parking_slot',
  'vehicle_2_type',
  'vehicle_2_number',
  'vehicle_2_parking_slot',
  'family_1_name',
  'family_1_age',
  'family_1_relation',
  'family_1_phone',
  'family_2_name',
  'family_2_age',
  'family_2_relation',
  'family_2_phone',
];

const BULK_IMPORT_SAMPLE_ROWS = [
  {
    name: 'Aarav Mehta',
    email: 'aarav.mehta@example.com',
    phone_number: '9876543210',
    block_name: 'Tower A',
    flat_number: '1403',
    flat_type: '3BHK',
    occupancy_type: 'Owner',
    move_in_date: '2025-06-01',
    move_out_date: '',
    id_type: 'Aadhaar',
    id_number: '1234-5678-9012',
    id_proof_url: '',
    emergency_name: 'Nisha Mehta',
    emergency_relation: 'Spouse',
    emergency_phone: '9876500001',
    push_notifications: 'TRUE',
    sms_alerts: 'TRUE',
    whatsapp_alerts: 'FALSE',
    can_approve_visitors: 'TRUE',
    can_view_bills: 'TRUE',
    can_raise_complaints: 'TRUE',
    vehicle_1_type: 'Car',
    vehicle_1_number: 'MH12AB1234',
    vehicle_1_parking_slot: 'B2-17',
    vehicle_2_type: 'Bike',
    vehicle_2_number: 'MH12XY7788',
    vehicle_2_parking_slot: 'B2-Bike-04',
    family_1_name: 'Nisha Mehta',
    family_1_age: '34',
    family_1_relation: 'Spouse',
    family_1_phone: '9876500001',
    family_2_name: 'Vihaan Mehta',
    family_2_age: '8',
    family_2_relation: 'Son',
    family_2_phone: '',
  },
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    phone_number: '9876543211',
    block_name: 'Tower B',
    flat_number: '0902',
    flat_type: '2BHK',
    occupancy_type: 'Tenant',
    move_in_date: '2026-01-15',
    move_out_date: '2027-01-14',
    id_type: 'PAN',
    id_number: 'ABCDE1234F',
    id_proof_url: '',
    emergency_name: 'Rohit Sharma',
    emergency_relation: 'Brother',
    emergency_phone: '9876500002',
    push_notifications: 'TRUE',
    sms_alerts: 'FALSE',
    whatsapp_alerts: 'TRUE',
    can_approve_visitors: 'TRUE',
    can_view_bills: 'TRUE',
    can_raise_complaints: 'TRUE',
    vehicle_1_type: 'Car',
    vehicle_1_number: 'DL8CAF2211',
    vehicle_1_parking_slot: 'P1-09',
    vehicle_2_type: '',
    vehicle_2_number: '',
    vehicle_2_parking_slot: '',
    family_1_name: 'Sana Sharma',
    family_1_age: '3',
    family_1_relation: 'Daughter',
    family_1_phone: '',
    family_2_name: '',
    family_2_age: '',
    family_2_relation: '',
    family_2_phone: '',
  },
];

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseBoolean(value: string, defaultValue: boolean) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  return defaultValue;
}

function buildResidentPayload(record: CsvRecord) {
  const vehicles = [1, 2]
    .map((index) => ({
      vehicle_type: record[`vehicle_${index}_type`] || 'Car',
      vehicle_number: record[`vehicle_${index}_number`] || '',
      parking_slot: record[`vehicle_${index}_parking_slot`] || '',
    }))
    .filter((vehicle) => vehicle.vehicle_number);

  const family = [1, 2]
    .map((index) => ({
      name: record[`family_${index}_name`] || '',
      age: record[`family_${index}_age`] || '',
      relation: record[`family_${index}_relation`] || '',
      phone: record[`family_${index}_phone`] || '',
    }))
    .filter((member) => member.name);

  return {
    basic: {
      name: record.name || '',
      email: record.email || '',
      phone_number: record.phone_number || '',
    },
    flat: {
      block_name: record.block_name || '',
      flat_number: record.flat_number || '',
      flat_type: record.flat_type || '',
      occupancy_type: record.occupancy_type || 'Owner',
      move_in_date: record.move_in_date || '',
      move_out_date: record.move_out_date || '',
    },
    identity: {
      id_type: record.id_type || 'Aadhaar',
      id_number: record.id_number || '',
      id_proof_url: record.id_proof_url || '',
    },
    emergency: {
      emergency_name: record.emergency_name || '',
      emergency_relation: record.emergency_relation || '',
      emergency_phone: record.emergency_phone || '',
    },
    notifications: {
      push_notifications: parseBoolean(record.push_notifications || '', true),
      sms_alerts: parseBoolean(record.sms_alerts || '', true),
      whatsapp_alerts: parseBoolean(record.whatsapp_alerts || '', false),
    },
    permissions: {
      can_approve_visitors: parseBoolean(record.can_approve_visitors || '', true),
      can_view_bills: parseBoolean(record.can_view_bills || '', true),
      can_raise_complaints: parseBoolean(record.can_raise_complaints || '', true),
    },
    vehicles,
    family,
  };
}

function validateResidentRecord(record: CsvRecord) {
  const missingFields = ['name', 'phone_number', 'block_name', 'flat_number', 'flat_type'].filter((field) => !record[field]?.trim());
  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(', ')}`;
  }

  if (!/^\d{10}$/.test(record.phone_number.trim())) {
    return 'Phone number must be exactly 10 digits';
  }

  const occupancyType = record.occupancy_type?.trim();
  if (occupancyType && !['Owner', 'Tenant', 'Family', 'Co-owner'].includes(occupancyType)) {
    return 'Occupancy type must be Owner, Tenant, Family, or Co-owner';
  }

  const flatType = record.flat_type?.trim();
  if (flatType && !['Studio', '1RK', '1BHK', '2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK', 'Villa', 'Penthouse', 'Other'].includes(flatType)) {
    return 'Flat type must be one of Studio, 1RK, 1BHK, 2BHK, 2.5BHK, 3BHK, 3.5BHK, 4BHK, Villa, Penthouse, or Other';
  }

  return null;
}

export default function ResidentsPage() {
  const router = useRouter();
  const [residents, setResidents] = useState<ResidentDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingKycId, setUpdatingKycId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [kycFilter, setKycFilter] = useState<'ALL' | ResidentDirectoryItem['kyc_status']>('ALL');
  const [occupancyFilter, setOccupancyFilter] = useState<'ALL' | string>('ALL');
  const [blockFilter, setBlockFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('block_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchResidents = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch('https://api.gatesync.in/api/v1/residents', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setResidents(
          (data.residents || []).map((resident: ResidentDirectoryItem) => ({
            ...resident,
            status: String(resident.status || 'ACTIVE').toUpperCase(),
            block_name: resident.block_name || null,
            flat_number: resident.flat_number || null,
            occupancy_type: resident.occupancy_type || 'Unassigned',
            flat_id: resident.flat_id || null,
          }))
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResidents();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, kycFilter, occupancyFilter, blockFilter, pageSize]);

  const toggleStatus = async (id: number, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const token = localStorage.getItem('gatepulse_token');
      const response = await fetch(`https://api.gatesync.in/api/v1/residents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.message || 'Could not update resident access right now.');
        return;
      }
      await fetchResidents();
    } catch (error) {
      console.error(error);
    }
  };

  const updateKycStatus = async (id: number, kycStatus: ResidentDirectoryItem['kyc_status']) => {
    try {
      setUpdatingKycId(id);
      const token = localStorage.getItem('gatepulse_token');
      await fetch(`https://api.gatesync.in/api/v1/residents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kyc_status: kycStatus })
      });
      fetchResidents();
    } catch (error) {
      console.error(error);
    } finally {
      setUpdatingKycId(null);
    }
  };

  const removeResident = async (id: number, flat_id: number) => {
    if (!confirm('Are you sure you want to remove this resident from this flat?')) return;
    try {
      const token = localStorage.getItem('gatepulse_token');
      await fetch(`https://api.gatesync.in/api/v1/residents/${id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ flat_id })
      });
      fetchResidents();
    } catch (error) {
      console.error(error);
    }
  };

  const downloadTemplate = () => {
    const rows = [
      BULK_IMPORT_HEADERS.join(','),
      ...BULK_IMPORT_SAMPLE_ROWS.map((row) => BULK_IMPORT_HEADERS.map((header) => csvEscape(row[header as keyof typeof row] || '')).join(',')),
    ];

    const csvContent = `data:text/csv;charset=utf-8,${rows.join('\n')}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'resident_bulk_import_template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSubmitting(true);
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const csv = String(loadEvent.target?.result || '');
        const rows = parseCsv(csv);

        if (rows.length < 2) {
          alert('The uploaded file is empty. Download the template and fill at least one resident row.');
          return;
        }

        const headers = rows[0].map((header) => header.trim());
        const missingHeaders = BULK_IMPORT_HEADERS.filter((header) => !headers.includes(header));
        if (missingHeaders.length > 0) {
          alert(`Template mismatch. Missing columns: ${missingHeaders.join(', ')}`);
          return;
        }

        const token = localStorage.getItem('gatepulse_token');
        const successes: number[] = [];
        const failures: string[] = [];

        for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
          const values = rows[rowIndex];
          const record = headers.reduce<CsvRecord>((accumulator, header, index) => {
            accumulator[header] = values[index]?.trim() || '';
            return accumulator;
          }, {});

          const isBlankRow = Object.values(record).every((value) => !value);
          if (isBlankRow) {
            continue;
          }

          const validationError = validateResidentRecord(record);
          if (validationError) {
            failures.push(`Row ${rowIndex + 1}: ${validationError}`);
            continue;
          }

          const payload = buildResidentPayload(record);
          const response = await fetch('https://api.gatesync.in/api/v1/residents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
          });
          const data = await response.json();

          if (data.success) {
            successes.push(rowIndex + 1);
          } else {
            failures.push(`Row ${rowIndex + 1}: ${data.message || 'Import failed'}`);
          }
        }

        const summaryLines = [
          `Imported ${successes.length} resident record(s).`,
          failures.length > 0 ? `Failed ${failures.length} row(s).` : 'No row failures.',
        ];

        if (failures.length > 0) {
          summaryLines.push('', 'First issues:');
          summaryLines.push(...failures.slice(0, 8));
        }

        alert(summaryLines.join('\n'));
        setShowImportModal(false);
        fetchResidents();
      } finally {
        setSubmitting(false);
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection('asc');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setKycFilter('ALL');
    setOccupancyFilter('ALL');
    setBlockFilter('ALL');
  };

  const applyQuickFilter = (filter: 'all' | 'pending-kyc' | 'inactive' | 'tenant' | 'verified') => {
    if (filter === 'all') {
      resetFilters();
      return;
    }

    setSearchTerm('');
    setStatusFilter(filter === 'inactive' ? 'DISABLED' : 'ALL');
    setKycFilter(filter === 'pending-kyc' ? 'Pending' : filter === 'verified' ? 'Verified' : 'ALL');
    setOccupancyFilter(filter === 'tenant' ? 'Tenant' : 'ALL');
    setBlockFilter('ALL');
  };

  const compareText = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  const isNonEmptyString = (value: string | null | undefined): value is string => Boolean(value);
  const blockOptions = [...new Set(residents.map((resident) => resident.block_name).filter(isNonEmptyString))].sort(compareText);
  const occupancyOptions = [...new Set(residents.map((resident) => resident.occupancy_type).filter(isNonEmptyString))].sort(compareText);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredResidents = residents.filter((resident) => {
    const matchesSearch = !normalizedSearchTerm || [
      resident.name,
      resident.phone_number,
      resident.email,
      resident.block_name,
      resident.flat_number,
    ].some((value) => value?.toLowerCase().includes(normalizedSearchTerm));

    const matchesStatus = statusFilter === 'ALL'
      || (statusFilter === 'ACTIVE' ? resident.status === 'ACTIVE' : resident.status !== 'ACTIVE');
    const matchesKyc = kycFilter === 'ALL' || resident.kyc_status === kycFilter;
    const matchesOccupancy = occupancyFilter === 'ALL' || resident.occupancy_type === occupancyFilter;
    const matchesBlock = blockFilter === 'ALL' || resident.block_name === blockFilter;

    return matchesSearch && matchesStatus && matchesKyc && matchesOccupancy && matchesBlock;
  });

  const sortedResidents = [...filteredResidents].sort((left, right) => {
    const directionMultiplier = sortDirection === 'asc' ? 1 : -1;

    if (sortKey === 'block_name') {
      return compareText(`${left.block_name} ${left.flat_number}`, `${right.block_name} ${right.flat_number}`) * directionMultiplier;
    }

    return compareText(String(left[sortKey]), String(right[sortKey])) * directionMultiplier;
  });

  const totalPages = Math.max(1, Math.ceil(sortedResidents.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedResidents = sortedResidents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageStart = sortedResidents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, sortedResidents.length);
  const filtersActive = Boolean(normalizedSearchTerm) || statusFilter !== 'ALL' || kycFilter !== 'ALL' || occupancyFilter !== 'ALL' || blockFilter !== 'ALL';
  const visiblePageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => Math.min(Math.max(currentPage - 2, 1) + index, totalPages)
  ).filter((page, index, allPages) => allPages.indexOf(page) === index);
  const quickFilterButtons = [
    { key: 'all', label: 'All', count: residents.length, active: !filtersActive },
    { key: 'pending-kyc', label: 'Pending KYC', count: residents.filter((resident) => resident.kyc_status === 'Pending').length, active: !normalizedSearchTerm && statusFilter === 'ALL' && kycFilter === 'Pending' && occupancyFilter === 'ALL' && blockFilter === 'ALL' },
    { key: 'inactive', label: 'Inactive', count: residents.filter((resident) => resident.status !== 'ACTIVE').length, active: !normalizedSearchTerm && statusFilter === 'DISABLED' && kycFilter === 'ALL' && occupancyFilter === 'ALL' && blockFilter === 'ALL' },
    { key: 'tenant', label: 'Tenant', count: residents.filter((resident) => resident.occupancy_type === 'Tenant').length, active: !normalizedSearchTerm && statusFilter === 'ALL' && kycFilter === 'ALL' && occupancyFilter === 'Tenant' && blockFilter === 'ALL' },
    { key: 'verified', label: 'Verified', count: residents.filter((resident) => resident.kyc_status === 'Verified').length, active: !normalizedSearchTerm && statusFilter === 'ALL' && kycFilter === 'Verified' && occupancyFilter === 'ALL' && blockFilter === 'ALL' },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Residents & Flats
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">High-density resident operations view for large communities.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)} className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Bulk Import
          </button>
          <a href="/admin/residents/add" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/20">
            + Add Resident
          </a>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-3">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
          <div className="relative w-full 2xl:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} type="text" placeholder="Search by name, phone, email, tower, or flat..." className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:border-brand-500" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-medium">{residents.length} total residents</span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 font-medium">
              {residents.filter((resident) => resident.status === 'ACTIVE').length} active
            </span>
            <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 font-medium">
              {residents.filter((resident) => resident.kyc_status === 'Pending').length} pending KYC
            </span>
            <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300 font-medium">
              {sortedResidents.length} matching
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)] xl:items-start">
            <div className="flex flex-wrap items-center gap-1.5">
              {quickFilterButtons.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => applyQuickFilter(filter.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    filter.active
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${filter.active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'DISABLED')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="ALL">Access</option>
                <option value="ACTIVE">Enabled</option>
                <option value="DISABLED">Disabled</option>
              </select>
              <select
                value={kycFilter}
                onChange={(event) => setKycFilter(event.target.value as 'ALL' | ResidentDirectoryItem['kyc_status'])}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="ALL">KYC</option>
                <option value="Pending">Pending</option>
                <option value="Verified">Verified</option>
                <option value="Rejected">Rejected</option>
              </select>
              <select
                value={occupancyFilter}
                onChange={(event) => setOccupancyFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="ALL">Occupancy</option>
                {occupancyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={blockFilter}
                onChange={(event) => setBlockFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="ALL">Tower</option>
                {blockOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 sm:col-span-1 xl:col-span-5 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-auto max-h-[calc(100vh-270px)] rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full table-fixed text-left text-[13px]">
            <thead className="text-slate-600 dark:text-slate-400">
              <tr>
                <th className="sticky top-0 z-10 w-[23%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-2">
                    <span>Resident</span>
                    <ArrowUpDown className={`h-3.5 w-3.5 ${sortKey === 'name' ? 'text-brand-500' : 'text-slate-400'}`} />
                  </button>
                </th>
                <th className="sticky top-0 z-10 w-[22%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  Contact
                </th>
                <th className="sticky top-0 z-10 w-[12%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  <button onClick={() => handleSort('block_name')} className="flex items-center gap-2">
                    <span>Unit</span>
                    <ArrowUpDown className={`h-3.5 w-3.5 ${sortKey === 'block_name' ? 'text-brand-500' : 'text-slate-400'}`} />
                  </button>
                </th>
                <th className="sticky top-0 z-10 w-[11%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  <button onClick={() => handleSort('occupancy_type')} className="flex items-center gap-2">
                    <span>Occupancy</span>
                    <ArrowUpDown className={`h-3.5 w-3.5 ${sortKey === 'occupancy_type' ? 'text-brand-500' : 'text-slate-400'}`} />
                  </button>
                </th>
                <th className="sticky top-0 z-10 w-[11%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-2">
                    <span>Access</span>
                    <ArrowUpDown className={`h-3.5 w-3.5 ${sortKey === 'status' ? 'text-brand-500' : 'text-slate-400'}`} />
                  </button>
                </th>
                <th className="sticky top-0 z-10 w-[13%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  <button onClick={() => handleSort('kyc_status')} className="flex items-center gap-2">
                    <span>KYC</span>
                    <ArrowUpDown className={`h-3.5 w-3.5 ${sortKey === 'kyc_status' ? 'text-brand-500' : 'text-slate-400'}`} />
                  </button>
                </th>
                <th className="sticky top-0 z-10 w-[8%] border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-right font-medium dark:border-slate-800 dark:bg-slate-950/95">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading resident directory...</td></tr>
              ) : sortedResidents.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">{filtersActive ? 'No residents match the current filters.' : 'No residents registered yet.'}</td></tr>
              ) : paginatedResidents.map((resident) => (
                <tr key={`${resident.id}-${resident.flat_number || 'unmapped'}`} className={`hover:bg-slate-50/70 dark:hover:bg-slate-900/50 transition-colors ${resident.status !== 'ACTIVE' ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${resident.status === 'ACTIVE' ? 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                        {resident.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                          {resident.name} {resident.status !== 'ACTIVE' && '(Disabled)'}
                        </p>
                        <p className="text-[11px] text-slate-500">Resident ID #{resident.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-slate-800 dark:text-slate-200">{resident.phone_number}</p>
                      <p className="truncate text-[11px] text-slate-500">{resident.email || 'No email on record'}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{resident.block_name}</span>
                      <p className="truncate text-[11px] text-slate-500">
                        {resident.block_name && resident.flat_number ? `Flat ${resident.flat_number}` : 'No flat mapped yet'}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${resident.occupancy_type === 'Owner' ? 'bg-purple-100 text-purple-700' : resident.occupancy_type === 'Tenant' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                      {resident.occupancy_type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      resident.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {resident.status === 'ACTIVE' ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
                      <div className={`flex w-max max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium whitespace-nowrap ${
                        resident.kyc_status === 'Verified'
                          ? 'bg-green-50 text-green-600'
                          : resident.kyc_status === 'Rejected'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-orange-50 text-orange-600'
                      }`}>
                        <CheckCircle2 className="h-3 w-3" /> {resident.kyc_status}
                      </div>
                      <select
                        value={resident.kyc_status}
                        onChange={(event) => updateKycStatus(resident.id, event.target.value as ResidentDirectoryItem['kyc_status'])}
                        disabled={updatingKycId === resident.id}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Verified">Verified</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Edit Full Profile" onClick={() => router.push(`/admin/residents/edit/${resident.id}`)} className="rounded-lg bg-blue-50 p-1.5 text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button title={resident.status === 'ACTIVE' ? 'Disable Access' : 'Activate Access'} onClick={() => toggleStatus(resident.id, resident.status)} className={`rounded-lg p-1.5 transition-colors ${resident.status === 'ACTIVE' ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20' : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20'}`}>
                        {resident.status === 'ACTIVE' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </button>
                      <button disabled={!resident.flat_id} title={resident.flat_id ? 'Remove from Flat' : 'No flat mapping to remove'} onClick={() => resident.flat_id && removeResident(resident.id, resident.flat_id)} className="rounded-lg bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Showing {pageStart}-{pageEnd} of {sortedResidents.length}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Sorted by {sortKey.replace('_', ' ')} {sortDirection.toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            {visiblePageNumbers.map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`min-w-[32px] rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-brand-500 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl p-8 w-full max-w-3xl shadow-2xl relative border border-slate-200 dark:border-slate-800">
              <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-brand-50 dark:bg-brand-500/10 rounded-full flex items-center justify-center text-brand-500">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bulk Import Residents</h2>
                  <p className="text-slate-500 text-sm mt-1">Download the full CSV template, fill one resident per row, then upload the file back here.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Template includes</h3>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <p>`basic`: name, email, phone</p>
                    <p>`flat`: tower, flat number, flat type, occupancy, move-in/out dates</p>
                    <p>`identity`: ID type, number, proof URL</p>
                    <p>`emergency`: name, relation, phone</p>
                    <p>`notifications` and `permissions` as TRUE/FALSE columns</p>
                    <p>Up to 2 vehicles and 2 family members per row</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Important rules</h3>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <p>Required columns per row: `name`, `phone_number`, `block_name`, `flat_number`, `flat_type`</p>
                    <p>`phone_number` must be exactly 10 digits</p>
                    <p>`flat_type` should be like `1BHK`, `2BHK`, `3BHK`, `Villa`</p>
                    <p>`occupancy_type` must be `Owner`, `Tenant`, `Family`, or `Co-owner`</p>
                    <p>Leave unused optional columns blank</p>
                    <p>Dates should be in `YYYY-MM-DD` format</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={downloadTemplate} className="flex flex-col items-center justify-center gap-2 p-5 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Download className="w-6 h-6 text-slate-400" />
                  <span className="text-sm font-medium">1. Download Comprehensive CSV Template</span>
                </button>
                <label className="flex flex-col items-center justify-center gap-2 p-5 border border-brand-200 bg-brand-50 dark:bg-brand-900/20 rounded-xl hover:border-brand-400 cursor-pointer transition-colors relative">
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={submitting} />
                  <UploadCloud className="w-6 h-6 text-brand-500" />
                  <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
                    {submitting ? 'Importing Residents...' : '2. Select Filled CSV and Import'}
                  </span>
                </label>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

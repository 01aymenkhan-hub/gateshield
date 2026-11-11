'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AdminGuard from '@/components/auth/AdminGuard';
import DateFilterInput from '@/components/ui/DateFilterInput';
import { downloadCsv } from '@/utils/csv';
import {
  FileBarChart,
  Download,
  Printer,
  Calendar,
  Building,
  Filter,
  Users,
  DoorOpen,
  DoorClosed,
  TrendingUp,
} from 'lucide-react';

export default function ReportsPage() {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gates, setGates] = useState<any[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [gateId, setGateId] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [department, setDepartment] = useState('ALL');
  const [status, setStatus] = useState('ALL');

  useEffect(() => {
    fetch('/api/gates')
      .then((r) => r.json())
      .then((d) => setGates(d.gates || []))
      .catch(() => {});
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (gateId !== 'ALL') params.set('gateId', gateId);
      if (category !== 'ALL') params.set('category', category);
      if (department !== 'ALL') params.set('department', department);
      if (status !== 'ALL') params.set('status', status);

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error('Error generating report:', e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, gateId, category, department, status]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCSV = () => {
    if (!reportData?.visits || reportData.visits.length === 0) return;
    const headers = [
      'Visit Number',
      'Visitor Name',
      'Category',
      'CNIC/License',
      'Phone',
      'Host',
      'Department',
      'Card No',
      'Entry Gate',
      'Check In',
      'Exit Gate',
      'Check Out',
      'Status',
    ];

    const rows = reportData.visits.map((v: any) => [
      v.visitNumber,
      v.person?.fullName,
      v.person?.category,
      v.person?.cnicNumber || v.person?.dlsNumber,
      v.person?.phoneNumber,
      v.hostName,
      v.department,
      v.visitorCardNo,
      v.entryGate?.name,
      new Date(v.checkInTime).toLocaleString(),
      v.exitGate?.name,
      v.checkOutTime ? new Date(v.checkOutTime).toLocaleString() : '',
      v.status,
    ]);

    // Escapes quotes and neutralizes =,+,-,@ formulas (CSV injection).
    downloadCsv(`gatekeeper_report_${Date.now()}.csv`, headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <AdminGuard>
        <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <FileBarChart className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Reports &amp; Analytics
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Generate operational audits, export logs, and print gate summaries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Controls (Hidden in print) */}
        <div className="no-print p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div>
              <DateFilterInput
                label="From Date"
                value={dateFrom}
                onChange={setDateFrom}
                title="Filter report start date"
              />
            </div>

            <div>
              <DateFilterInput
                label="To Date"
                value={dateTo}
                onChange={setDateTo}
                title="Filter report end date"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Gate
              </label>
              <select
                value={gateId}
                onChange={(e) => setGateId(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
              >
                <option value="ALL">All Gates</option>
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="VISITOR">Visitors</option>
                <option value="VENDOR">Vendors</option>
                <option value="INTERVIEW">Interviews</option>
                <option value="SPECIAL_GUEST">Special Guests</option>
                <option value="CONTRACTOR">Contractors</option>
                <option value="DELIVERY">Deliveries</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="CHECKED_IN">Currently Inside</option>
                <option value="CHECKED_OUT">Checked Out</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Department
              </label>
              <input
                type="text"
                placeholder="e.g. Accounts"
                value={department === 'ALL' ? '' : department}
                onChange={(e) => setDepartment(e.target.value || 'ALL')}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Report Printable Area */}
        <div className="printable-area space-y-6">
          {/* Print Only Header */}
          <div className="hidden print:block border-b-2 border-slate-900 pb-3 mb-4">
            <h1 className="text-2xl font-black uppercase">GateShield • Security Audit Report</h1>
            <p className="text-xs text-slate-600">
              Generated: {new Date().toLocaleString()} • Filtered Records: {reportData?.summary?.total || 0}
            </p>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs text-slate-400 block font-medium">Total Entries</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {reportData?.summary?.total || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
              <span className="text-xs text-emerald-800 dark:text-emerald-300 block font-medium">
                Currently Inside
              </span>
              <span className="text-2xl font-black text-emerald-950 dark:text-emerald-200">
                {reportData?.summary?.checkedIn || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs text-slate-400 block font-medium">Checked Out</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {reportData?.summary?.checkedOut || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs text-slate-400 block font-medium">Vendors / Suppliers</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {reportData?.summary?.categories?.VENDOR || 0}
              </span>
            </div>
          </div>

          {/* Detailed Ledger Table */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[750px]">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3">Visit #</th>
                    <th className="px-4 py-3">Visitor Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Host &amp; Dept</th>
                    <th className="px-4 py-3">Card #</th>
                    <th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">Exit</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 text-xs">
                        Generating report data...
                      </td>
                    </tr>
                  ) : !reportData?.visits || reportData.visits.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 text-xs">
                        No records match the selected report criteria.
                      </td>
                    </tr>
                  ) : (
                    reportData.visits.map((v: any) => (
                      <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {v.visitNumber}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {v.person?.fullName}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                            {v.person?.category || 'VISITOR'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {v.hostName} ({v.department})
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                          {v.visitorCardNo || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {new Date(v.checkInTime).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {v.checkOutTime
                            ? new Date(v.checkOutTime).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              v.status === 'CHECKED_IN'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  </AppLayout>
);
}

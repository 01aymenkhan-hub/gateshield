'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AdminGuard from '@/components/auth/AdminGuard';
import { Settings, Building, Plus, Save, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const [gates, setGates] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    default_visitor_badge_prefix: 'GK-',
    auto_checkout_hours: '12',
    require_visitor_photo: 'true',
    company_name: 'Industrial Zone Gate Facility',
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);

  // New Gate Modal
  const [isAddGateOpen, setIsAddGateOpen] = useState(false);
  const [gateName, setGateName] = useState('');
  const [gateDescription, setGateDescription] = useState('');
  const [gateType, setGateType] = useState<'BOTH' | 'ENTRY' | 'EXIT'>('BOTH');

  const loadData = async () => {
    try {
      const [gRes, sRes] = await Promise.all([fetch('/api/gates'), fetch('/api/settings')]);
      if (gRes.ok) {
        const gData = await gRes.json();
        setGates(gData.gates || []);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.settings && Object.keys(sData.settings).length > 0) {
          setSettings((prev: any) => ({ ...prev, ...sData.settings }));
        }
      }
    } catch (e) {
      console.error('Error loading settings data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        setSettingsSavedMessage(true);
        setTimeout(() => setSettingsSavedMessage(false), 2500);
      }
    } catch (e) {
      console.error('Error saving settings:', e);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateName.trim()) return;

    try {
      const res = await fetch('/api/gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: gateName.trim(),
          description: gateDescription.trim(),
          type: gateType,
        }),
      });

      if (res.ok) {
        setIsAddGateOpen(false);
        setGateName('');
        setGateDescription('');
        loadData();
      }
    } catch (e) {
      console.error('Error creating gate:', e);
    }
  };

  return (
    <AppLayout>
      <AdminGuard>
        <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              System Settings &amp; Gates
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Manage facility checkpoints, physical gates, and security parameters
            </p>
          </div>
        </div>

        {/* Section 1: Physical Gates Management */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                Active Checkpoints &amp; Gates ({gates.length})
              </h2>
              <p className="text-xs text-slate-400">Entry and exit access points</p>
            </div>

            <button
              onClick={() => setIsAddGateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Add Gate</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gates.map((g) => (
              <div
                key={g.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-500" />
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {g.name}
                    </span>
                  </div>
                  {g.description && (
                    <p className="text-[11px] text-slate-400">{g.description}</p>
                  )}
                </div>

                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {g.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: General System Preferences */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">
              System Configuration Parameters
            </h2>
            <p className="text-xs text-slate-400">Rules governing badge prefixes and automated logs</p>
          </div>

          {settingsSavedMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Settings updated successfully
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Company / Facility Name</label>
                <input
                  type="text"
                  value={settings.company_name || ''}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Badge ID Prefix</label>
                <input
                  type="text"
                  value={settings.default_visitor_badge_prefix || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, default_visitor_badge_prefix: e.target.value })
                  }
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Overstay Threshold (Hours)
                </label>
                <input
                  type="number"
                  value={settings.auto_checkout_hours || '12'}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_checkout_hours: e.target.value })
                  }
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Add Gate Modal */}
      {isAddGateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Add New Gate</h3>

            <div>
              <label className="block text-xs font-semibold mb-1">Gate Name</label>
              <input
                type="text"
                placeholder="e.g. North Exit Gate"
                value={gateName}
                onChange={(e) => setGateName(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Type</label>
              <select
                value={gateType}
                onChange={(e) => setGateType(e.target.value as any)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="BOTH">Entry &amp; Exit (Both)</option>
                <option value="ENTRY">Entry Only</option>
                <option value="EXIT">Exit Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Description (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Warehouse & Logistics side"
                value={gateDescription}
                onChange={(e) => setGateDescription(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddGateOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGate}
                disabled={!gateName.trim()}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 text-white cursor-pointer"
              >
                Save Gate
              </button>
            </div>
          </div>
        </div>
      )}
      </AdminGuard>
    </AppLayout>
  );
}

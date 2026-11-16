'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { normalizeIp } from '@/lib/ipAddress';

type NetworkSettings = {
  policy: { enabled: boolean; addresses: string[] };
  clientIp: string | null;
};

const endpoint = '/api/settings/portal-network';

export default function PortalNetworkSettings() {
  const fieldId = useId();
  const [savedPolicy, setSavedPolicy] = useState<NetworkSettings['policy'] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const hasChanges = savedPolicy !== null && (
    enabled !== savedPolicy.enabled ||
    addresses.length !== savedPolicy.addresses.length ||
    addresses.some(ip => !savedPolicy.addresses.includes(ip))
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const { policy, clientIp }: NetworkSettings = await response.json();
        setEnabled(policy.enabled);
        setAddresses(policy.addresses);
        setClientIp(clientIp);
        setSavedPolicy(policy);
      } catch {
        if (!controller.signal.aborted) setError('Unable to load portal network settings.');
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  function addAddress(value: string) {
    setSaved(false);
    setError('');
    const ip = normalizeIp(value);
    if (!ip) {
      setError('Enter a valid IP address.');
      return;
    }
    if (addresses.includes(ip)) {
      setError('This IP address is already on the list.');
      return;
    }
    if (addresses.length >= 100) {
      setError('You can add up to 100 IP addresses.');
      return;
    }
    setAddresses([...addresses, ip]);
    if (value === address) setAddress('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || saving || (enabled && !clientIp)) return;
    setError('');
    setSaved(false);
    if (enabled && address.trim()) {
      setError('Click Add IP address to include the address you entered.');
      return;
    }
    if (enabled && addresses.length === 0) {
      setError('Add at least one IP address, or choose Allow all networks.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, addresses }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Unable to save portal network settings.');
        return;
      }
      const result: NetworkSettings = data;
      setEnabled(result.policy.enabled);
      setAddresses(result.policy.addresses);
      setSavedPolicy(result.policy);
      setClientIp(result.clientIp);
      setSaved(true);
    } catch {
      setError('Unable to save portal network settings.');
    } finally {
      setSaving(false);
    }
  }

  const changeMode = (restricted: boolean) => {
    setEnabled(restricted);
    setError('');
    setSaved(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white">Portal Network Access</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Choose where operators and employees can sign in. Admins can sign in from any network.
      </p>
      <form className="mt-4 space-y-4" onSubmit={save}>
        <fieldset className="space-y-3" disabled={!savedPolicy || saving}>
          <legend className="mb-2 text-xs font-semibold">Access for operators and employees</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { restricted: false, label: 'Allow all networks', description: 'Sign in from any internet connection.' },
              { restricted: true, label: 'Only approved networks', description: 'Sign in from the IP addresses you add.' },
            ].map(option => (
              <label key={option.label} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 has-checked:border-blue-500 has-checked:bg-blue-50 dark:border-slate-700 dark:has-checked:bg-blue-950/40">
                <input type="radio" name={fieldId} checked={enabled === option.restricted}
                  onChange={() => changeMode(option.restricted)} className="mt-0.5 accent-blue-600" />
                <span>
                  <span className="block text-xs font-bold">{option.label}</span>
                  <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{option.description}</span>
                </span>
              </label>
            ))}
          </div>

          {enabled && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50">
              <label htmlFor={fieldId} className="block text-xs font-semibold">Network IP address</label>
              <div className="flex flex-wrap gap-2">
                <input id={fieldId} dir="ltr" type="text" autoComplete="off" spellCheck={false} maxLength={64}
                  value={address} onChange={event => { setAddress(event.target.value); setError(''); setSaved(false); }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addAddress(address);
                    }
                  }}
                  aria-describedby={`${fieldId}-help`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900" />
                <button type="button" onClick={() => addAddress(address)} disabled={!address.trim()}
                  className="rounded-lg border border-blue-600 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50 dark:text-blue-300">
                  Add IP address
                </button>
              </div>
              <p id={`${fieldId}-help`} className="text-xs text-slate-500 dark:text-slate-400">
                Enter the public IP of the internet connection you want to approve. IPv4 and IPv6 both work.
              </p>
              {clientIp && (
                <button type="button" onClick={() => addAddress(clientIp)} disabled={addresses.includes(clientIp)}
                  className="text-xs font-semibold text-blue-700 underline disabled:text-slate-500 disabled:no-underline dark:text-blue-300">
                  {addresses.includes(clientIp) ? 'Current network added' : 'Add my current network'} <code dir="ltr">({clientIp})</code>
                </button>
              )}
              {addresses.length > 0 && (
                <ul aria-label="Approved IP addresses" className="space-y-2">
                  {addresses.map(ip => (
                    <li key={ip} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                      <code dir="ltr" className="min-w-0 break-all text-xs">{ip}</code>
                      <button type="button" aria-label={`Remove ${ip}`} onClick={() => {
                        setAddresses(addresses.filter(item => item !== ip));
                        setError('');
                        setSaved(false);
                      }} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {savedPolicy && !clientIp && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  This server needs to detect your network before restrictions can be turned on. Contact the person who manages the server.
                </p>
              )}
            </div>
          )}
          {hasChanges && (
            <button type="submit" disabled={enabled && !clientIp}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save network access'}
            </button>
          )}
        </fieldset>
        {!savedPolicy && !error && <p role="status" className="text-xs">Loading network settings…</p>}
        {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
        {saved && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">Network access saved.</p>}
      </form>
    </section>
  );
}

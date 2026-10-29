'use client';

import { useState } from 'react';

type Slot = { key: string; label: string; code: string; name: string };
type Props = {
  companyId: string;
  jurisdiction: string;
  call: (url: string, init?: RequestInit) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  busy: boolean;
  onError: (message: string) => void;
};

// Lets an administrator give each category the account number their accountant uses. Only the code and
// name can change. The server checks the numbers again and refuses one code for two different accounts.
export default function AccountNumbers({ companyId, jurisdiction, call, busy, onError }: Props) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [edited, setEdited] = useState<Record<string, { code: string; name: string }>>({});
  const [custom, setCustom] = useState(false);
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const base = `company_id=${encodeURIComponent(companyId)}&jurisdiction=${jurisdiction}`;

  async function guard(work: () => Promise<void>) {
    setWorking(true);
    setNote('');
    onError('');
    try { await work(); } catch (caught) { onError((caught as Error).message); } finally { setWorking(false); }
  }
  function show(body: { slots: Slot[]; overrides: Record<string, unknown> }) {
    setSlots(body.slots);
    setEdited({});
    setCustom(Object.keys(body.overrides).length > 0);
  }
  const load = () => guard(async () => show(await call(`/api/company-accounts?${base}`)));
  const save = () => guard(async () => {
    const all = Object.fromEntries((slots || []).map(s => [s.key, edited[s.key] || { code: s.code, name: s.name }]));
    show(await call('/api/company-accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId, jurisdiction, overrides: all }) }));
    setNote('Saved. New journals use these numbers.');
  });
  const reset = () => guard(async () => {
    await call(`/api/company-accounts?company_id=${encodeURIComponent(companyId)}`, { method: 'DELETE' });
    show(await call(`/api/company-accounts?${base}`));
    setNote('Back to the standard numbers.');
  });
  const importCsv = (file: File | undefined) => file && guard(async () => {
    const csv = await file.text();
    show(await call('/api/company-accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId, jurisdiction, csv }) }));
    setNote('Imported. New journals use these numbers.');
  });

  const dirty = Object.keys(edited).length > 0;
  const disabled = busy || working || !companyId;

  return (
    <section aria-labelledby="acct-h">
      <h2 id="acct-h">Account numbers</h2>
      <p className="pr-note">The journal uses these numbers. Start from the standard set, or use the numbers your accountant already has. This is not an official chart of accounts. Estonia does not require one.</p>
      <div className="pr-actions">
        <button className="pr-button pr-secondary" type="button" onClick={load} disabled={disabled}>{slots ? 'Reload' : 'Show account numbers'}</button>
        {slots && <a className="pr-button pr-secondary pr-linkbutton" href={`/api/company-accounts?${base}&format=csv`}>Download as spreadsheet</a>}
        {slots && <label className="pr-button pr-secondary pr-linkbutton">Upload edited spreadsheet<input type="file" accept=".csv,text/csv" hidden onChange={e => { importCsv(e.target.files?.[0]); e.target.value = ''; }} disabled={disabled} /></label>}
      </div>
      {slots && (
        <>
          <p className="pr-note">{custom ? 'This company has its own numbers.' : 'This company uses the standard numbers.'}</p>
          <div className="pr-scroll">
            <table className="pr-table pr-stack">
              <caption className="pr-sr">Account number for each type of payment</caption>
              <thead><tr><th scope="col">What it is</th><th scope="col">Number</th><th scope="col">Account name</th></tr></thead>
              <tbody>
                {slots.map(s => {
                  const v = edited[s.key] || { code: s.code, name: s.name };
                  const set = (patch: Partial<{ code: string; name: string }>) => setEdited(prev => ({ ...prev, [s.key]: { ...v, ...patch } }));
                  return (
                    <tr key={s.key}>
                      <th scope="row" data-label="What it is">{s.label}</th>
                      <td data-label="Number"><input aria-label={`Account number for ${s.label}`} value={v.code} maxLength={12} onChange={e => set({ code: e.target.value })} disabled={disabled} className="pr-code" /></td>
                      <td data-label="Account name"><input aria-label={`Account name for ${s.label}`} value={v.name} maxLength={80} onChange={e => set({ name: e.target.value })} disabled={disabled} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pr-actions">
            <button className="pr-button" type="button" onClick={save} disabled={disabled || !dirty}>Save account numbers</button>
            <button className="pr-button pr-secondary" type="button" onClick={reset} disabled={disabled || !custom}>Go back to standard numbers</button>
          </div>
          {!companyId && <p className="pr-note">Enter the company ID first.</p>}
          <p className="pr-note" role="status">{note}</p>
          <p className="pr-note">Only an administrator can save. If you are not one, the save will be refused.</p>
        </>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { Notice } from "../../components/action-modals";
import ConfirmDialog from "../../components/confirm-dialog";
import {
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "../../components/form-styles";
import Modal from "../../components/modal";
import SetPinDialog from "../../components/set-pin-dialog";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  apiFetch,
  describeError,
  fetchStaff,
  useLoad,
  type StaffMember,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

// Suggestions for the role box; any other role can be typed in.
const ROLES = [
  "Sales attendant",
  "Store manager",
  "Stock keeper",
  "Cleaner",
  "Security",
];

function RoleOptions() {
  return (
    <datalist id="staff-roles">
      {ROLES.map((r) => (
        <option key={r} value={r} />
      ))}
    </datalist>
  );
}

export default function StaffPage() {
  const staff = useLoad(fetchStaff);
  const [form, setForm] = useState({ name: "", role: "", pin: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);

  const visible = staff.data?.filter((s) => matches(search, s.name, s.role));

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add staff member");
      setForm({ name: "", role: "", pin: "" });
      setNotice(`${body.name} added. They can now log in with their PIN.`);
      await staff.reload();
    } catch (e) {
      setError(describeError(e, "Could not add staff member"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (member: StaffMember) => {
    setRemoving(null);
    setError(null);
    try {
      const res = await apiFetch(`/staff/${member.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove staff member");
      setNotice(`${member.name} removed.`);
      await staff.reload();
    } catch (e) {
      setError(describeError(e, "Could not remove staff member"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold">Staff</h1>
      <p className="mt-1 text-sm text-muted">
        Staff log in with their PIN. They can only use the till and the Requests
        page; they cannot see sales, customers, expenses or change inventory.
      </p>
      <Notice text={notice} />
      <RoleOptions />
      {removing && (
        <ConfirmDialog
          title="Remove staff member"
          message={`Remove ${removing.name}? Their PIN will stop working. Sales and requests they made are kept.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {resetting && staff.data && (
        <SetPinDialog
          staff={staff.data}
          staffId={resetting.id}
          onClose={() => setResetting(null)}
          onSaved={(member) => {
            setResetting(null);
            setNotice(`${member.name} has a new PIN. Tell them in person.`);
          }}
        />
      )}
      {editing && (
        <Modal title="Edit staff member" onClose={() => setEditing(null)}>
          <EditStaffForm
            member={editing}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              void staff.reload();
            }}
          />
        </Modal>
      )}

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="min-w-40 flex-1 text-sm font-medium">
          Name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="min-w-40 flex-1 text-sm font-medium">
          Role
          <input
            required
            list="staff-roles"
            placeholder="e.g. Sales attendant"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="w-40 text-sm font-medium">
          PIN (4–8 digits)
          <input
            required
            inputMode="numeric"
            pattern="\d{4,8}"
            autoComplete="off"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            className={INPUT}
          />
        </label>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Adding…" : "Add staff"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search staff by name or role"
        />
      </div>

      <div className="mt-4">
        {staff.failed ? (
          <LoadError />
        ) : !staff.data || !visible ? (
          <Loading />
        ) : staff.data.length === 0 ? (
          <p className="text-sm text-muted">No staff yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <ul className="divide-y divide-line rounded-lg bg-white shadow-sm">
            {visible.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="font-medium">{s.name}</span>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                  {s.role ?? "No role set"}
                </span>
                <button
                  onClick={() => setEditing(s)}
                  className="ml-auto font-medium text-brand-deep hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => setResetting(s)}
                  className="font-medium text-brand-deep hover:underline"
                >
                  Reset PIN
                </button>
                <button
                  onClick={() => setRemoving(s)}
                  className="font-medium text-red-700 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EditStaffForm({
  member,
  onSaved,
  onCancel,
}: {
  member: StaffMember;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: member.name,
    role: member.role ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/staff/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? "Could not update staff member");
      onSaved(`${body.name} updated.`);
    } catch (e) {
      setError(describeError(e, "Could not update staff member"));
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="text-sm font-medium">
        Name
        <input
          autoFocus
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Role
        <input
          required
          list="staff-roles"
          placeholder="e.g. Sales attendant"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className={INPUT}
        />
      </label>
      <p className="text-xs text-muted">
        Their PIN stays the same. To give them a new PIN, use Reset PIN on the
        staff list.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

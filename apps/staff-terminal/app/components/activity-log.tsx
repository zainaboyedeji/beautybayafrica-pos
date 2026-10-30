"use client";

import { useEffect, useState } from "react";
import type { ActivityAction, ActivityEntry } from "@pos/types";
import Pagination, { usePagination } from "./pagination";
import SearchBox, { matches, NoMatches } from "./search-box";
import { fetchActivity } from "../lib/api";
import { LoadError, Loading } from "../lib/status";
import { SELECT, TABLE, TABLE_CARD, THEAD } from "./form-styles";

const ACTION_LABELS: Record<ActivityAction, string> = {
  login: "Logged in",
  login_failed: "Failed login",
  sale: "Sale",
  sale_refunded: "Refund",
  sale_edited: "Sale edited",
  product_added: "Product added",
  product_updated: "Product edited",
  inventory_imported: "CSV upload",
  customer_added: "Customer added",
  customer_updated: "Customer edited",
  staff_added: "Staff added",
  staff_updated: "Staff edited",
  staff_removed: "Staff removed",
  pin_reset: "PIN reset",
  supplier_added: "Supplier added",
  supplier_updated: "Supplier edited",
  supplier_removed: "Supplier removed",
  expense_recorded: "Expense recorded",
  expense_deleted: "Expense deleted",
  request_made: "Request made",
  pin_requested: "PIN request",
  request_decided: "Request decided",
  store_item_added: "Store item added",
  store_item_updated: "Store item edited",
  store_item_removed: "Store item removed",
  gift_added: "Gift added",
  gift_updated: "Gift edited",
  gift_removed: "Gift removed",
};

const GROUPS: Record<string, { label: string; actions: ActivityAction[] }> = {
  logins: { label: "Logins", actions: ["login", "login_failed"] },
  sales: { label: "Sales", actions: ["sale", "sale_refunded", "sale_edited"] },
  inventory: {
    label: "Inventory",
    actions: [
      "product_added",
      "product_updated",
      "inventory_imported",
      "gift_added",
      "gift_updated",
      "gift_removed",
    ],
  },
  customers: {
    label: "Customers",
    actions: ["customer_added", "customer_updated"],
  },
  staff: {
    label: "Staff & PINs",
    actions: ["staff_added", "staff_updated", "staff_removed", "pin_reset"],
  },
  suppliers: {
    label: "Suppliers",
    actions: ["supplier_added", "supplier_updated", "supplier_removed"],
  },
  expenses: {
    label: "Expenses",
    actions: ["expense_recorded", "expense_deleted"],
  },
  requests: {
    label: "Requests",
    actions: ["request_made", "pin_requested", "request_decided"],
  },
  storeItems: {
    label: "Store items",
    actions: ["store_item_added", "store_item_updated", "store_item_removed"],
  },
};

// Failed logins and removals stand out; everything else is calm.
const ACTION_STYLES: Partial<Record<ActivityAction, string>> = {
  login_failed: "bg-red-100 text-red-800",
  staff_removed: "bg-red-100 text-red-800",
  supplier_removed: "bg-red-100 text-red-800",
  expense_deleted: "bg-red-100 text-red-800",
  store_item_removed: "bg-red-100 text-red-800",
  gift_removed: "bg-red-100 text-red-800",
  sale_refunded: "bg-red-100 text-red-800",
  sale: "bg-emerald-100 text-emerald-800",
  login: "bg-surface-alt text-muted",
};

const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 0, label: "All time" },
];

const ROLE_LABELS: Record<ActivityEntry["actorRole"], string> = {
  admin: "Admin",
  staff: "Staff",
  visitor: "Not logged in",
};

const isToday = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString();

/**
 * Who did what in the POS, and when, with filters. Given a `user` ("admin"
 * or a staff id), it shows only that person's activity.
 */
export default function ActivityLog({ user }: { user?: string }) {
  const [days, setDays] = useState(7);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("");
  const [group, setGroup] = useState("");

  useEffect(() => {
    let current = true;
    // `current` ignores a slow answer for a period no longer chosen.
    fetchActivity(days, user)
      .then((data) => {
        if (!current) return;
        setEntries(data);
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [days, user]);

  const people = [...new Set((entries ?? []).map((e) => e.actorName))].sort(
    (a, b) => a.localeCompare(b),
  );
  const visible = entries?.filter(
    (e) =>
      // "Today" means today on this computer's calendar, not the last 24 hours.
      (days !== 1 || isToday(e.at)) &&
      (!person || e.actorName === person) &&
      (!group || GROUPS[group].actions.includes(e.action)) &&
      matches(search, e.actorName, e.summary, ACTION_LABELS[e.action]),
  );
  const pager = usePagination(
    visible,
    JSON.stringify([days, search, person, group]),
  );
  const failedLogins = (visible ?? []).filter(
    (e) => e.action === "login_failed",
  ).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={
              user
                ? "Search what they did"
                : "Search by person or what they did"
            }
          />
        </div>
        <select
          aria-label="Period"
          value={days}
          onChange={(e) => {
            setEntries(null);
            setDays(Number(e.target.value));
          }}
          className={SELECT}
        >
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
        {!user && (
          <select
            aria-label="Person"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className={SELECT}
          >
            <option value="">Everyone</option>
            {people.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Type of activity"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className={SELECT}
        >
          <option value="">All activity</option>
          {Object.entries(GROUPS).map(([key, g]) => (
            <option key={key} value={key}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {failedLogins > 0 && (
        <p className="mt-3 text-sm text-red-700">
          {failedLogins} failed login{failedLogins === 1 ? "" : "s"} in this
          list.
        </p>
      )}

      <div className="mt-4">
        {failed ? (
          <LoadError />
        ) : !entries || !visible ? (
          <Loading />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">No activity in this period yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <div className={TABLE_CARD}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">When</th>
                  {!user && <th className="px-4 py-3">Who</th>}
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pager.pageItems?.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    {!user && (
                      <td className="px-4 py-3">
                        <span className="font-medium">{e.actorName}</span>
                        {ROLE_LABELS[e.actorRole] !== e.actorName && (
                          <span className="block text-xs text-muted">
                            {ROLE_LABELS[e.actorRole]}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          ACTION_STYLES[e.action] ??
                          "bg-brand-soft text-brand-deep"
                        }`}
                      >
                        {ACTION_LABELS[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pager={pager} label="entries" />
    </>
  );
}

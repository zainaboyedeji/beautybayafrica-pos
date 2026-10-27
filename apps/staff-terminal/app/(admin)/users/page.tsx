"use client";

import Link from "next/link";
import { useState } from "react";
import type { UserSummary } from "@pos/types";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import { fetchUsers, money, useLoad } from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import {
  ACCESS_LABELS,
  ACCESS_STYLES,
  ago,
} from "../../components/user-labels";
import { TABLE, TABLE_CARD, THEAD } from "../../components/form-styles";
import PageHeader from "../../components/page-header";

/** Everyone who can log in, with when they were last active and their sales. */
export default function UsersPage() {
  const users = useLoad(fetchUsers);
  const [search, setSearch] = useState("");
  const [access, setAccess] = useState<UserSummary["access"] | "">("");

  const visible = users.data?.filter(
    (u) =>
      (!access || u.access === access) &&
      matches(search, u.name, u.jobRole, ACCESS_LABELS[u.access]),
  );
  const pager = usePagination(visible, JSON.stringify([search, access]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon="users"
        section="Team"
        title="Users"
        description={
          <>
            Everyone who can log in, and former staff who left a history. Open a
            user to see their sales and everything they did.
          </>
        }
      >
        <Link
          href="/staff"
          className="text-sm font-medium text-brand-deep hover:underline"
        >
          Add or manage staff →
        </Link>
      </PageHeader>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by name or role"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["", "admin", "staff", "former"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAccess(a)}
              aria-pressed={access === a}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                access === a
                  ? "bg-gradient-to-r from-brand to-brand-hover text-ink shadow-md shadow-brand/30"
                  : "bg-white text-ink shadow-sm hover:bg-brand-soft"
              }`}
            >
              {a ? ACCESS_LABELS[a] : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {users.failed ? (
          <LoadError />
        ) : !users.data || !visible ? (
          <Loading />
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <div className={TABLE_CARD}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3 text-right">Sales</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pager.pageItems?.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/user?id=${encodeURIComponent(u.id)}`}
                        className="font-medium hover:text-brand-deep"
                      >
                        {u.name}
                      </Link>
                      {u.jobRole && (
                        <span className="block text-xs text-muted">
                          {u.jobRole}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACCESS_STYLES[u.access]}`}
                      >
                        {ACCESS_LABELS[u.access]}
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3"
                      title={
                        u.lastLogin
                          ? new Date(u.lastLogin).toLocaleString()
                          : undefined
                      }
                    >
                      {ago(u.lastLogin)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3"
                      title={
                        u.lastActivity
                          ? new Date(u.lastActivity).toLocaleString()
                          : undefined
                      }
                    >
                      {ago(u.lastActivity)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {u.sales > 0 ? (
                        <>
                          <span className="font-medium">
                            {money.format(u.salesTotal)}
                          </span>
                          <span className="block text-xs text-muted">
                            {u.sales} sale{u.sales === 1 ? "" : "s"}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/user?id=${encodeURIComponent(u.id)}`}
                        className="font-medium text-brand-deep hover:underline"
                      >
                        View history
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pager={pager} label="users" />
    </div>
  );
}

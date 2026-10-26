import ActivityLog from "../../components/activity-log";

/** Who did what in the POS, and when. */
export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold">Activity</h1>
      <p className="mt-1 text-sm text-muted">
        Who logged in and what they did: sales, changes to products, staff,
        suppliers, expenses and requests. Failed logins are shown in red.
      </p>
      <div className="mt-6">
        <ActivityLog />
      </div>
    </div>
  );
}

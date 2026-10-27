import ActivityLog from "../../components/activity-log";
import PageHeader from "../../components/page-header";

/** Who did what in the POS, and when. */
export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon="activity"
        section="Overview"
        title="Activity"
        description={
          <>
            Who logged in and what they did: sales, changes to products, staff,
            suppliers, expenses and requests. Failed logins are shown in red.
          </>
        }
      />
      <div className="mt-6">
        <ActivityLog />
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer, PageError, PageHeader, PageLoading } from "../components/PageLayout.jsx";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notificationApi.js";
import { requireAuthToken } from "../services/session.js";
import { formatDateTime } from "../utils/datetime.js";
import { getUserErrorMessage } from "../utils/userError.js";

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const token = requireAuthToken({ onMissing: setError });
    if (!token) { queueMicrotask(() => setLoading(false)); return undefined; }
    listNotifications({ token })
      .then((response) => { if (!cancelled) setItems(response.notifications || []); })
      .catch((err) => { if (!cancelled) setError(getUserErrorMessage(err, "Failed to load notifications.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function markRead(item) {
    if (item.readAt) return;
    const token = requireAuthToken();
    if (!token) return;
    try {
      const response = await markNotificationRead({ token, id: item.id });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: response.notification.readAt } : entry));
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to update notification."));
    }
  }

  async function markAllRead() {
    const token = requireAuthToken();
    if (!token) return;
    try {
      await markAllNotificationsRead({ token });
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to update notifications."));
    }
  }

  const hasUnread = items.some((item) => !item.readAt);
  return (
    <PageContainer stack>
      <PageHeader title="Notifications" description="Messages about important account and transaction updates." actions={hasUnread ? <button type="button" onClick={markAllRead} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50">Mark all as read</button> : null} />
      <PageError>{error}</PageError>
      {loading ? <PageLoading>Loading notifications...</PageLoading> : items.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">You have no notifications yet.</div> : (
        <div className="space-y-3">
          {items.map((item) => <article key={item.id} onClick={() => markRead(item)} className={`rounded-2xl border p-4 ${item.readAt ? "bg-white" : "border-purple-200 bg-purple-50"}`}>
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold text-gray-900">{item.title}</h2><p className="mt-1 text-sm text-gray-700">{item.message}</p></div>{!item.readAt && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-purple-600" aria-label="Unread" />}</div>
            <div className="mt-3 flex items-center justify-between gap-3"><time className="text-xs text-gray-500">{formatDateTime(item.createdAt)}</time>{item.transactionId && <Link to={`/transactions/${item.transactionId}`} onClick={() => markRead(item)} className="text-xs font-medium text-purple-700 hover:underline">View transaction</Link>}</div>
          </article>)}
        </div>
      )}
    </PageContainer>
  );
}

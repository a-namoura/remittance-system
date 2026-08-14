import { useEffect, useState } from "react";
import { PageContainer, PageError, PageHeader, PageLoading } from "../components/PageLayout.jsx";
import BackButton from "../components/BackButton.jsx";
import { requireAuthToken } from "../services/session.js";
import { listBlockedUsers, unblockUser } from "../services/userApi.js";
import { getUserErrorMessage } from "../utils/userError.js";

export default function Blocked() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  useEffect(() => {
    let cancelled = false;
    const token = requireAuthToken();
    listBlockedUsers({ token }).then((response) => !cancelled && setAccounts(response.users || [])).catch((err) => !cancelled && setError(getUserErrorMessage(err, "Failed to load blocked accounts."))).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);
  async function unblock(account) {
    try { setBusyId(String(account.id)); setError(""); const token = requireAuthToken(); await unblockUser({ token, userId: account.id }); setAccounts((current) => current.filter((item) => String(item.id) !== String(account.id))); }
    catch (err) { setError(getUserErrorMessage(err, "Failed to unblock account.")); }
    finally { setBusyId(""); }
  }
  return <PageContainer stack><div><BackButton to="/settings" label="Back to Settings" /></div><PageHeader title="Blocked" description="Accounts you have blocked cannot find you or contact you." /><PageError>{error}</PageError>{loading ? <PageLoading>Loading blocked accounts...</PageLoading> : accounts.length ? <div className="space-y-3">{accounts.map((account) => <article key={account.id} className="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5"><div><h2 className="font-semibold text-gray-900">{account.displayName}</h2><p className="text-sm text-gray-500">@{account.username}</p></div><button type="button" disabled={busyId === String(account.id)} onClick={() => unblock(account)} className="app-secondary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60">{busyId === String(account.id) ? "Unblocking..." : "Unblock"}</button></article>)}</div> : <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">You have no blocked accounts.</div>}</PageContainer>;
}

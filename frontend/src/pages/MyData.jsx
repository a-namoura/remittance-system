import { useState } from "react";
import BackButton from "../components/BackButton.jsx";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { requireAuthToken } from "../services/session.js";
import { exportMyData } from "../services/userApi.js";
import { publishSystemNotification } from "../services/systemNotifications.js";
import { getUserErrorMessage } from "../utils/userError.js";

export default function MyData() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function downloadData() {
    try {
      setBusy(true); setError("");
      const token = requireAuthToken();
      const data = await exportMyData({ token });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `remittance-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      publishSystemNotification("Your account data was downloaded.", { variant: "success" });
    } catch (err) { setError(getUserErrorMessage(err, "Failed to export your account data.")); }
    finally { setBusy(false); }
  }

  return <PageContainer stack><div><BackButton to="/settings" label="Back to Settings" /></div><PageHeader title="Your data" description="Download a portable copy of the information associated with your account." /><PageError>{error}</PageError><section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Export account data</h2><p className="mt-2 max-w-2xl text-sm text-gray-500">The JSON file includes your profile details and transaction history. It excludes passwords, verification codes, internal security fields, and private system records.</p><button type="button" onClick={downloadData} disabled={busy} className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60">{busy ? "Preparing export..." : "Download my data"}</button></section></PageContainer>;
}

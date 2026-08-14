import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageContainer, PageError, PageHeader } from "../components/PageLayout.jsx";
import { SettingsToggle } from "../components/SettingsControls.jsx";
import ActionDialog from "../components/ActionDialog.jsx";
import PasswordStrengthIndicator from "../components/PasswordStrengthIndicator.jsx";
import { getCurrentUser } from "../services/authApi.js";
import { clearSessionStorage, requireAuthToken } from "../services/session.js";
import { changeMyPassword, deactivateMyAccount, deleteMyAccount, updateMyProfile } from "../services/userApi.js";
import { publishSystemNotification } from "../services/systemNotifications.js";
import { getUserErrorMessage } from "../utils/userError.js";
import { isPasswordPolicySatisfied } from "../utils/passwordPolicy.js";

export default function Settings() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState({ isDiscoverable: true });
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountAction, setAccountAction] = useState("");
  const [password, setPassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = requireAuthToken();
    if (!token) return undefined;
    getCurrentUser({ token })
      .then((user) => !cancelled && setDraft((current) => ({ ...current, isDiscoverable: user?.isDiscoverable !== false })))
      .catch((err) => !cancelled && setError(getUserErrorMessage(err, "Failed to load settings.")));
    return () => { cancelled = true; };
  }, []);

  async function updateDiscoverability(value) {
    const previous = draft.isDiscoverable;
    setDraft({ isDiscoverable: value });
    try {
      setPrivacyBusy(true); setError("");
      const token = requireAuthToken();
      await updateMyProfile({ token, isDiscoverable: value });
      publishSystemNotification("Discoverability updated.", { variant: "success" });
    } catch (err) {
      setDraft({ isDiscoverable: previous });
      setError(getUserErrorMessage(err, "Failed to update discoverability."));
    } finally { setPrivacyBusy(false); }
  }

  function closeAccountDialog() {
    if (accountBusy) return;
    setAccountAction(""); setPassword(""); setDeleteConfirmation(""); setNewPassword(""); setConfirmPassword("");
  }

  async function confirmAccountAction() {
    try {
      setAccountBusy(true); setError("");
      const token = requireAuthToken();
      if (accountAction === "password") {
        await changeMyPassword({ token, currentPassword: password, newPassword });
        publishSystemNotification("Password changed successfully. Sign in again with your new password.", { variant: "success" });
      } else if (accountAction === "delete") {
        await deleteMyAccount({ token, password, confirmation: deleteConfirmation });
      } else {
        await deactivateMyAccount({ token, password });
      }
      clearSessionStorage();
      navigate("/login", { replace: true });
    } catch (err) {
      const fallback = accountAction === "password" ? "Password change failed." : accountAction === "delete" ? "Account deletion failed." : "Account deactivation failed.";
      setError(getUserErrorMessage(err, fallback));
    } finally { setAccountBusy(false); }
  }

  return (
    <PageContainer stack>
      <PageHeader title="Settings" description="Control discoverability, account access, and privacy." />
      <PageError>{error}</PageError>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white px-6 py-3 shadow-sm"><SettingsToggle checked={draft.isDiscoverable} onChange={updateDiscoverability} disabled={privacyBusy} label="Allow users to find me" description="Let other users discover your account when searching for contacts." /></section>
        <Link to="/settings/data" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-purple-300 hover:bg-purple-50">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900">Your data</h2><p className="mt-1 text-sm text-gray-500">Download a copy of your profile and transaction history.</p></div><span className="text-xl text-purple-600" aria-hidden="true">→</span></div>
        </Link>
        <Link to="/settings/blocked" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-purple-300 hover:bg-purple-50">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900">Blocked</h2><p className="mt-1 text-sm text-gray-500">View blocked accounts and unblock them.</p></div><span className="text-xl text-purple-600" aria-hidden="true">→</span></div>
        </Link>
        <button type="button" onClick={() => setAccountAction("password")} className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-purple-300 hover:bg-purple-50">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900">Change your password</h2><p className="mt-1 text-sm text-gray-500">Update your password and sign out all existing sessions.</p></div><span className="text-xl text-purple-600" aria-hidden="true">→</span></div>
        </button>
        <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
          <p className="mt-1 text-sm text-gray-500">These actions affect access to your account and require your current password.</p>
          <div className="mt-5 divide-y divide-gray-200">
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold text-gray-900">Deactivate account</h3><p className="mt-1 text-sm text-gray-500">Disable sign-in and hide your account. Contact support if you need it restored.</p></div><button type="button" onClick={() => setAccountAction("deactivate")} className="app-secondary-button shrink-0 rounded-xl px-4 py-2 text-sm font-semibold">Deactivate</button></div>
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold text-gray-900">Delete account</h3><p className="mt-1 text-sm text-gray-500">Permanently erase your personal account information and disable access. Financial records required for integrity are retained without your profile details.</p></div><button type="button" onClick={() => setAccountAction("delete")} className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete account</button></div>
          </div>
        </section>
      </div>
      <ActionDialog open={Boolean(accountAction)} title={accountAction === "password" ? "Change your password" : accountAction === "delete" ? "Delete your account?" : "Deactivate your account?"} description={accountAction === "password" ? "You will be signed out of all sessions after your password changes." : accountAction === "delete" ? "This permanently erases your personal account information and cannot be undone." : "You will be signed out immediately and will not be able to sign in."} confirmLabel={accountAction === "password" ? "Change password" : accountAction === "delete" ? "Delete account" : "Deactivate account"} confirmDisabled={!password || (accountAction === "password" && (!isPasswordPolicySatisfied(newPassword) || newPassword !== confirmPassword)) || (accountAction === "delete" && deleteConfirmation !== "DELETE")} danger={accountAction !== "password"} busy={accountBusy} onCancel={closeAccountDialog} onConfirm={confirmAccountAction}>
        <div className="space-y-4"><label className="block text-sm font-medium text-gray-700">Current password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="app-control-surface mt-1 w-full rounded-xl px-3 py-2 text-sm" /></label>{accountAction === "password" ? <><label className="block text-sm font-medium text-gray-700">New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="app-control-surface mt-1 w-full rounded-xl px-3 py-2 text-sm" /></label><PasswordStrengthIndicator password={newPassword} /><label className="block text-sm font-medium text-gray-700">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="app-control-surface mt-1 w-full rounded-xl px-3 py-2 text-sm" />{confirmPassword && newPassword !== confirmPassword ? <span className="mt-1 block text-xs font-medium text-red-600">Passwords do not match.</span> : null}</label></> : null}{accountAction === "delete" ? <label className="block text-sm font-medium text-gray-700">Type DELETE to confirm<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="app-control-surface mt-1 w-full rounded-xl px-3 py-2 text-sm" /></label> : null}</div>
      </ActionDialog>
    </PageContainer>
  );
}

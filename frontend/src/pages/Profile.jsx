import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer, PageError, PageHeader, PageLoading, PageNotice } from "../components/PageLayout.jsx";
import { getCurrentUser } from "../services/authApi.js";
import { requireAuthToken } from "../services/session.js";
import { getUserErrorMessage } from "../utils/userError.js";
import { sendPhoneChangeCode, updateMyProfile, verifyPhoneChange } from "../services/userApi.js";
import CopyableWalletAddress from "../components/CopyableWalletAddress.jsx";
import { FORM_CODE_INPUT_CLASS } from "../styles/formClasses.js";

const COUNTRIES_API = import.meta.env.VITE_COUNTRIES_API;
const FLAG_BASE = import.meta.env.VITE_FLAG_BASE_URL || "";
const MAX_LOCAL_PHONE_DIGITS = 12;
const DEFAULT_COUNTRY = {
  name: "Palestine", flag: FLAG_BASE ? `${FLAG_BASE}/ps.png` : "", iso2: "PS", iso3: "PSE", dialCode: "+970",
};

function normalizeDigits(value) { return String(value || "").replace(/\D/g, ""); }

function initials(user) {
  const values = [user?.firstName, user?.lastName].filter(Boolean);
  if (values.length) return values.map((value) => value[0]).join("").slice(0, 2).toUpperCase();
  return String(user?.username || "U").slice(0, 2).toUpperCase();
}

function Detail({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value || "Not provided"}</dd>
    </div>
  );
}

export default function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const editing = false;
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "" });
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countries, setCountries] = useState([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [localPhone, setLocalPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = requireAuthToken();
      if (!token) return setLoading(false);
      try {
        const result = await getCurrentUser({ token });
        if (!cancelled) {
          setUser(result);
          setForm({ firstName: result?.firstName || "", lastName: result?.lastName || "", phoneNumber: result?.phoneNumber || "" });
        }
      } catch (err) {
        if (!cancelled) setError(getUserErrorMessage(err, "Failed to load your profile."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!COUNTRIES_API) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    async function loadCountries() {
      try {
        setCountryLoading(true);
        const response = await fetch(COUNTRIES_API, { signal: controller.signal });
        if (!response.ok) throw new Error(`Countries API error ${response.status}`);
        const data = await response.json();
        const list = data.map((item) => {
          const name = item?.name;
          const iso2 = item?.alpha2Code || "";
          const iso3 = item?.alpha3Code || "";
          const rawCode = String(item?.callingCodes?.[0] || "").trim();
          if (!name || !rawCode) return null;
          const occupied = name.toLowerCase() === "israel";
          return {
            name: occupied ? "Occupied Palestinian Territories" : name,
            iso2, iso3,
            dialCode: rawCode.startsWith("+") ? rawCode : `+${rawCode}`,
            flag: FLAG_BASE && iso2 ? `${FLAG_BASE}/${(occupied ? "ps" : iso2.toLowerCase())}.png` : "",
          };
        }).filter(Boolean).filter((item) => item.iso2?.toUpperCase() !== "PS").sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setCountries(list);
      } catch (err) {
        if (!cancelled && err?.name !== "AbortError") setCountries([]);
      } finally { if (!cancelled) setCountryLoading(false); }
    }
    loadCountries();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const displayName = useMemo(() =>
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "Member",
  [user]);

  async function saveProfile(event) {
    event.preventDefault();
    try {
      setSaving(true); setError(""); setNotice("");
      const token = requireAuthToken();
      const response = await updateMyProfile({ token, firstName: form.firstName, lastName: form.lastName });
      setUser((current) => ({ ...current, ...response.user }));
      setNotice("Profile updated.");
    } catch (err) { setError(getUserErrorMessage(err, "Failed to update your profile.")); }
    finally { setSaving(false); }
  }

  function updatePhone(value, selectedCountry = country) {
    const normalized = normalizeDigits(value).slice(0, MAX_LOCAL_PHONE_DIGITS);
    setLocalPhone(normalized);
    setForm((current) => ({ ...current, phoneNumber: normalized ? `${selectedCountry.dialCode}${normalized}` : current.phoneNumber }));
    setPhoneCode("");
    setPhoneCodeSent(false);
  }

  async function requestPhoneCode() {
    try {
      setPhoneBusy(true); setError(""); setNotice("");
      const token = requireAuthToken();
      await sendPhoneChangeCode({ token, phoneNumber: form.phoneNumber });
      setPhoneCodeSent(true);
      setNotice("Verification code sent. It expires in 5 minutes.");
    } catch (err) { setError(getUserErrorMessage(err, "Failed to send the verification code.")); }
    finally { setPhoneBusy(false); }
  }

  async function verifyPhone() {
    try {
      setPhoneBusy(true); setError(""); setNotice("");
      const token = requireAuthToken();
      const response = await verifyPhoneChange({ token, phoneNumber: form.phoneNumber, code: phoneCode });
      setUser((current) => ({ ...current, ...response.user }));
      setForm((current) => ({ ...current, phoneNumber: response.user.phoneNumber }));
      setPhoneCode(""); setPhoneCodeSent(false);
      setNotice("Phone number verified and updated.");
    } catch (err) { setError(getUserErrorMessage(err, "Phone verification failed.")); }
    finally { setPhoneBusy(false); }
  }

  if (loading) return <PageContainer><PageLoading>Loading profile...</PageLoading></PageContainer>;

  return (
    <PageContainer stack>
      <PageHeader title="Profile" description="Your personal details and account identity." actions={
        <Link to="/settings" className="app-secondary-button rounded-xl px-4 py-2 text-sm font-medium">Settings</Link>
      } />
      <PageError>{error}</PageError>
      <PageNotice variant="success">{notice}</PageNotice>
      {user ? (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-3xl font-semibold text-white shadow-lg shadow-purple-200/50">
              {initials(user)}
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900">{displayName}</h2>
            <p className="mt-1 text-sm text-gray-500">@{user.username}</p>
            <span className="mt-4 inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold capitalize text-purple-700">{user.role || "member"}</span>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Personal information</h2>
                <p className="mt-1 text-sm text-gray-500">The information associated with your account.</p>
              </div>
            </div>
            {editing ? <form onSubmit={saveProfile} className="mt-6 grid gap-4 sm:grid-cols-2">
              {[['firstName','First name'],['lastName','Last name']].map(([key,label]) => <label key={key} className="text-sm font-medium text-gray-700">{label}<input value={form[key]} maxLength={80} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="app-control-surface mt-2 w-full rounded-xl px-3 py-2.5 text-sm" /></label>)}
              <div className="sm:col-span-2 space-y-3">
                <p className="text-xs text-gray-500">Current number: <span className="font-medium text-gray-700">{user.phoneNumber || "Not provided"}</span></p>
                <div><label className="mb-1 block text-xs font-medium text-gray-600">Country code</label><div className="relative">
                  <select className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-11 pr-8 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500" value={country.name} onChange={(e) => { const next = e.target.value === "Palestine" ? DEFAULT_COUNTRY : countries.find((item) => item.name === e.target.value); if (next) { setCountry(next); if (localPhone) updatePhone(localPhone, next); } }}>
                    <option value="Palestine">Palestine</option>{countries.map((item) => <option key={item.iso3 || item.name} value={item.name}>{item.name}</option>)}
                  </select><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><img src={country.flag} alt={country.name} className="h-4 w-6 rounded-sm border object-cover" /></div><div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">v</div>
                </div>{countryLoading ? <p className="mt-1 text-xs text-gray-500">Loading countries...</p> : null}</div>
                <div><label className="mb-1 block text-xs font-medium text-gray-600">Mobile number</label><div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500"><div className="flex items-center whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">{country.dialCode}</div><input type="tel" autoComplete="tel-national" value={localPhone} maxLength={MAX_LOCAL_PHONE_DIGITS} onChange={(e) => updatePhone(e.target.value)} placeholder="XX XXX XXXX" className="flex-1 border-0 px-3 py-2 text-sm focus:outline-none" /></div></div>
                <p className="text-xs text-gray-500">Enter the new number. It will be saved only after SMS verification.</p>
                {form.phoneNumber !== (user.phoneNumber || "") ? <div className="mt-3 flex flex-wrap items-end gap-3">
                  {phoneCodeSent ? <label className="text-xs font-medium text-gray-600">SMS verification code<input inputMode="numeric" autoComplete="one-time-code" placeholder="******" value={phoneCode} maxLength={6} onChange={(e) => setPhoneCode(normalizeDigits(e.target.value).slice(0, 6))} className={`${FORM_CODE_INPUT_CLASS} mt-1 w-48`} /><span className="mt-2 block font-normal text-gray-500">We sent a code to <span className="font-medium">{form.phoneNumber}</span>.</span></label> : null}
                  <button type="button" disabled={phoneBusy || (phoneCodeSent && phoneCode.length !== 6)} onClick={phoneCodeSent ? verifyPhone : requestPhoneCode} className="app-secondary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60">{phoneBusy ? "Please wait..." : phoneCodeSent ? "Verify and update" : "Send verification code"}</button>
                </div> : <p className="mt-2 text-xs font-medium text-green-700">{user.phoneVerifiedAt ? "Verified phone number" : "Current phone number"}</p>}
              </div>
              <div className="sm:col-span-2"><button disabled={saving} className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60">{saving ? "Saving..." : "Save changes"}</button></div>
            </form> : <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Detail label="First name" value={user.firstName} />
              <Detail label="Last name" value={user.lastName} />
              <Detail label="Email address" value={user.email} />
              <Detail label="Phone number" value={user.phoneNumber} />
              <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Wallet address</dt>{user.wallet?.address ? <dd className="mt-1"><CopyableWalletAddress address={user.wallet.address} label="" className="p-1 text-sm font-medium" /></dd> : <dd className="mt-1 text-sm font-medium text-gray-900">Not provided</dd>}</div>
            </dl>}
          </section>
        </div>
      ) : null}
    </PageContainer>
  );
}

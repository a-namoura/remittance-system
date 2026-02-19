import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createFriend, deleteFriend, listFriends } from "../services/friendApi.js";
import { getAuthToken } from "../services/session.js";
import { searchUsers } from "../services/userApi.js";
import { formatDateOnly } from "../utils/datetime.js";
import { isValidEvmAddress } from "../utils/security.js";

import { getUserErrorMessage } from "../utils/userError.js";
const MAX_FRIEND_NAME = 80;
const MAX_FRIEND_USERNAME = 40;
const MAX_FRIEND_NOTES = 280;

function buildChatSendLink(friend) {
  const params = new URLSearchParams();
  params.set("compose", "send");

  const friendId = String(friend?.id || "").trim();
  const username = String(friend?.username || "").trim();
  const walletAddress = String(friend?.walletAddress || "").trim();

  if (friendId) {
    params.set("friendId", friendId);
  }

  if (username) {
    params.set("friendUsername", username);
  }

  if (walletAddress) {
    params.set("friendWallet", walletAddress);
  }

  return `/chat?${params.toString()}`;
}

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadFriends() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setError("You must be logged in.");
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");
        const data = await listFriends({ token });
        if (isCancelled) return;
        setFriends(data.friends || []);
      } catch (err) {
        if (isCancelled) return;
        setError(getUserErrorMessage(err, "Failed to load friends."));
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadFriends();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleDeleteFriend(friendId) {
    const token = getAuthToken();
    if (!token) {
      setError("You must be logged in.");
      return;
    }

    const confirmed = window.confirm("Remove this friend from your list?");
    if (!confirmed) return;

    try {
      await deleteFriend({ token, id: friendId });
      setFriends((prev) => prev.filter((friend) => String(friend.id) !== String(friendId)));
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to remove friend."));
    }
  }

  function openModal() {
    setName("");
    setUsername("");
    setWalletAddress("");
    setNotes("");
    setModalError("");
    setAccountQuery("");
    setAccountResults([]);
    setAccountLoading(false);
    setAccountError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSaving(false);
    setModalError("");
    setAccountError("");
  }

  function applyAccountResult(account) {
    const accountUsername = String(account.username || "").trim();
    const accountDisplayName = String(
      account.displayName || account.username || ""
    ).trim();
    const accountWallet = String(account.walletAddress || "").trim();

    setName((current) =>
      String(current || "").trim() ? current : accountDisplayName
    );
    setUsername(accountUsername);
    setWalletAddress(accountWallet);
    setAccountQuery(accountUsername);
    setAccountError("");
  }

  async function handleCreateFriend(event) {
    event.preventDefault();
    setModalError("");

    const normalizedName = name.trim();
    const normalizedUsername = username.trim();
    const normalizedWallet = walletAddress.trim();
    const normalizedNotes = notes.trim();

    if (!normalizedName) {
      setModalError("Friend name is required.");
      return;
    }

    if (!normalizedUsername && !normalizedWallet) {
      setModalError("Add at least username or wallet address.");
      return;
    }

    if (normalizedWallet && !isValidEvmAddress(normalizedWallet)) {
      setModalError("Wallet address must be a valid EVM address.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setModalError("You must be logged in.");
      return;
    }

    try {
      setSaving(true);
      const response = await createFriend({
        token,
        label: normalizedName,
        username: normalizedUsername || undefined,
        walletAddress: normalizedWallet || undefined,
        notes: normalizedNotes || undefined,
      });

      if (response.friend) {
        setFriends((prev) => [response.friend, ...prev]);
      }
      closeModal();
    } catch (err) {
      setModalError(getUserErrorMessage(err, "Failed to save friend."));
    } finally {
      setSaving(false);
    }
  }

  const filteredFriends = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return friends;

    return friends.filter((friend) => {
      const source = [
        friend.label,
        friend.username,
        friend.walletAddress,
        friend.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return source.includes(normalizedSearch);
    });
  }, [friends, search]);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    let isCancelled = false;
    const token = getAuthToken();

    if (!token) {
      setAccountResults([]);
      setAccountError("You must be logged in.");
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setAccountLoading(true);
        setAccountError("");
        const data = await searchUsers({
          token,
          query: accountQuery,
          limit: 8,
        });
        if (isCancelled) return;
        setAccountResults(data.users || []);
      } catch (err) {
        if (isCancelled) return;
        setAccountResults([]);
        setAccountError(getUserErrorMessage(err, "Failed to search app accounts."));
      } finally {
        if (!isCancelled) {
          setAccountLoading(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isModalOpen, accountQuery]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Friends</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your saved recipients and quickly reuse them while sending
            money.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex h-10 items-center justify-center rounded-full bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700"
        >
          Add friend
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search friends..."
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Loading friends...
        </div>
      ) : filteredFriends.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center">
          <p className="text-base font-medium text-gray-900">
            No friends saved yet
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Add friends to speed up future transfers.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Add your first friend
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredFriends.map((friend) => (
            <article
              key={friend.id}
              className="rounded-2xl border bg-white p-5 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {friend.label}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Added {formatDateOnly(friend.createdAt) || "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteFriend(friend.id)}
                  className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>

              {friend.username && (
                <div className="text-sm text-gray-700">
                  Username: <span className="font-medium">{friend.username}</span>
                </div>
              )}

              {friend.walletAddress && (
                <div className="text-xs font-mono break-all text-gray-600">
                  Wallet: {friend.walletAddress}
                </div>
              )}

              {friend.notes && (
                <p className="text-sm text-gray-600">{friend.notes}</p>
              )}

              <div className="pt-1">
                <Link
                  to={buildChatSendLink(friend)}
                  className="inline-flex text-xs font-medium text-purple-600 hover:underline"
                >
                  Send money to this friend
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Add friend</h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-sm text-gray-400 hover:text-gray-600"
                aria-label="Close add friend modal"
              >
                X
              </button>
            </div>

            {modalError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateFriend} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Find app account
                </label>
                <input
                  type="text"
                  value={accountQuery}
                  onChange={(event) => setAccountQuery(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Search by name"
                />

                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2">
                  {accountLoading && (
                    <p className="px-1 py-1 text-xs text-gray-500">Searching...</p>
                  )}

                  {!accountLoading && accountResults.length === 0 && (
                    <p className="px-1 py-1 text-xs text-gray-500">
                      No app accounts found.
                    </p>
                  )}

                  {!accountLoading &&
                    accountResults.map((account) => (
                      <button
                        key={String(account.id)}
                        type="button"
                        onClick={() => applyAccountResult(account)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left text-xs hover:border-purple-300"
                      >
                        <div className="font-medium text-gray-900">
                          {account.displayName || account.username}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          @{account.username}
                        </div>
                      </button>
                    ))}
                </div>

                {accountError && (
                  <p className="mt-1 text-xs text-red-600">{accountError}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Friend name
                </label>
                <input
                  type="text"
                  value={name}
                  maxLength={MAX_FRIEND_NAME}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Example: Max"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  maxLength={MAX_FRIEND_USERNAME}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="username"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Wallet address
                </label>
                <input
                  type="text"
                  value={walletAddress}
                  maxLength={42}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setWalletAddress(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  maxLength={MAX_FRIEND_NOTES}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Relationship, location, purpose..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save friend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

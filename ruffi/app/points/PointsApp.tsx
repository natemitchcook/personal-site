// @steered SNARE-2 2026-09-29

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AwardWatch,
  PointProgram,
  RankedAwardOffer,
  RuffiPointsState,
  SearchResult,
  WatchAlert,
} from "../../packages/points/src/types.ts";

type Catalog = {
  programs: PointProgram[];
  strategy: { directConnectorCount: number };
};

type Status = { tone: "good" | "warn" | "bad"; text: string } | undefined;
const RUFFI_BASE_PATH = "/ruffi";
const STARTER_QUERY =
  "Find the cheapest one-way economy award from JFK or EWR to LAX or SNA in July 2027 on American, United, or Delta. Nonstop only.";

async function requestApi<T>(
  url: string,
  authorization: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${RUFFI_BASE_PATH}${url}`, {
    ...init,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Ruffi could not complete the request.");
  return body as T;
}

function points(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function localClock(value: string | undefined) {
  const match = value?.match(/T(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${hour24 >= 12 ? "PM" : "AM"}`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function searchTags(result: SearchResult): string[] {
  const intent = result.intent;
  return [
    `${intent.origins.label} to ${intent.destinations.label}`,
    intent.startDate === intent.endDate
      ? shortDate(intent.startDate)
      : `${shortDate(intent.startDate)} to ${shortDate(intent.endDate)}`,
    `${intent.travelers} traveler${intent.travelers === 1 ? "" : "s"}`,
    intent.cabins.map(cabinName).join(", "),
    intent.maxStops === 0 ? "Nonstop only" : undefined,
    intent.sources?.length ? intent.sources.map(cabinName).join(", ") : undefined,
    intent.departureTime?.label,
  ].filter((value): value is string => Boolean(value));
}

function cabinName(value: string) {
  return value
    .replace("premium_economy", "premium economy")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PointsApp({ authorization }: { authorization: string }) {
  const [state, setState] = useState<RuffiPointsState>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [query, setQuery] = useState(STARTER_QUERY);
  const [result, setResult] = useState<SearchResult>();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Status>();
  const [newProgram, setNewProgram] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const api = useCallback(
    <T,>(url: string, init?: RequestInit) =>
      requestApi<T>(url, authorization, init),
    [authorization]
  );

  const refresh = useCallback(async () => {
    const [nextState, nextCatalog] = await Promise.all([
      api<RuffiPointsState>("/api/v1/points/state"),
      api<Catalog>("/api/v1/points/catalog"),
    ]);
    setState(nextState);
    setCatalog(nextCatalog);
  }, [api]);

  useEffect(() => {
    refresh()
      .catch((error) => setStatus({ tone: "bad", text: error.message }))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!state?.watches.some((watch) => watch.enabled)) return;
      api<{ alerts: WatchAlert[] }>("/api/v1/points/watches/check", {
        method: "POST",
        body: JSON.stringify({ force: false }),
      })
        .then(async (checked) => {
          for (const alert of checked.alerts) {
            if (
              state.notifications.browser &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification(alert.title, { body: alert.message });
            }
          }
          if (checked.alerts.length > 0) await refresh();
        })
        .catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, state]);

  const programsById = useMemo(
    () => new Map(catalog?.programs.map((program) => [program.id, program]) ?? []),
    [catalog]
  );

  const unusedPrograms = useMemo(
    () =>
      catalog?.programs.filter(
        (program) =>
          !state?.wallet.balances.some((balance) => balance.programId === program.id)
      ) ?? [],
    [catalog, state]
  );

  async function saveState(next: RuffiPointsState, message = "Wallet saved locally.") {
    setStatus(undefined);
    try {
      const saved = await api<RuffiPointsState>("/api/v1/points/state", {
        method: "PUT",
        body: JSON.stringify({
          wallet: next.wallet,
          notifications: next.notifications,
          preferenceNotes: next.preferenceNotes,
        }),
      });
      setState(saved);
      setStatus({ tone: "good", text: message });
    } catch (error) {
      setStatus({
        tone: "bad",
        text: error instanceof Error ? error.message : "Save failed.",
      });
    }
  }

  async function search() {
    setSearching(true);
    setStatus(undefined);
    try {
      const next = await api<SearchResult>("/api/v1/points/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          previousIntent: hasSearched ? result?.intent : undefined,
        }),
      });
      setResult(next);
      setHasSearched(true);
      setQuery("");
      setStatus(
        next.provider.live
          ? {
              tone: "good",
              text: `Searched ${next.provider.name}'s latest cached award data.`,
            }
          : { tone: "warn", text: next.provider.message }
      );
    } catch (error) {
      setStatus({
        tone: "bad",
        text: error instanceof Error ? error.message : "Search failed.",
      });
    } finally {
      setSearching(false);
    }
  }

  async function createWatch() {
    setStatus(undefined);
    try {
      if (
        state?.notifications.browser &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        await Notification.requestPermission();
      }
      await api("/api/v1/points/watches", {
        method: "POST",
        body: JSON.stringify(result ? { intent: result.intent } : { query }),
      });
      await refresh();
      setStatus({
        tone: result?.provider.live ? "good" : "warn",
        text: result?.provider.live
          ? "Watch is on. Ruffi will check more often as departure approaches."
          : "Watch saved. Connect a live provider before expecting real alerts.",
      });
    } catch (error) {
      setStatus({
        tone: "bad",
        text: error instanceof Error ? error.message : "Watch could not be created.",
      });
    }
  }

  async function checkWatches() {
    setChecking(true);
    setStatus(undefined);
    try {
      const checked = await api<{ checked: number; alerts: WatchAlert[] }>(
        "/api/v1/points/watches/check",
        { method: "POST", body: JSON.stringify({ force: true }) }
      );
      for (const alert of checked.alerts) {
        if (
          state?.notifications.browser &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(alert.title, { body: alert.message });
        }
      }
      await refresh();
      setStatus({
        tone: "good",
        text: `Checked ${checked.checked} watch${checked.checked === 1 ? "" : "es"}. ${checked.alerts.length} material change${checked.alerts.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({
        tone: "bad",
        text: error instanceof Error ? error.message : "Watch check failed.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function removeWatch(watch: AwardWatch) {
    await api(`/api/v1/points/watches?id=${encodeURIComponent(watch.id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  if (loading || !state || !catalog) {
    return (
      <main className="shell loading">
        <p className="eyebrow">RUFFI POINTS</p>
        <h1>Loading your wallet...</h1>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Ruffi Points home">
          <span>
            <strong>Ruffi</strong>
            <small>Award travel assistant</small>
          </span>
        </a>
        <nav>
          <a href="#wallet">Wallet</a>
          <a href="#watches">Alerts</a>
        </nav>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AWARD TRAVEL, WITHOUT THE TAB SPRAWL</p>
          <h1>Find the flight your points can actually book.</h1>
          <p className="lede">
            Describe the trip once. Then narrow it naturally, like “SNA only,
            nonstop, departing after 10am.”
          </p>
        </div>
        <div className="search-card">
          <label htmlFor="award-query">
            {hasSearched ? "What should Ruffi change?" : "What trip are you looking for?"}
          </label>
          <textarea
            id="award-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder={
              hasSearched
                ? "Try: SNA only, departing between 10am and 4pm."
                : "Tell Ruffi the airports, dates, cabin, airlines, and constraints that matter."
            }
          />
          <div className="button-row">
            <button className="primary" onClick={search} disabled={searching || query.trim().length < 2}>
              {searching
                ? "Searching award data..."
                : hasSearched
                  ? "Refine this search"
                  : "Search award flights"}
            </button>
            <button className="secondary" onClick={createWatch}>Turn on alerts</button>
            {hasSearched ? (
              <button
                className="text-button reset-search"
                onClick={() => {
                  setHasSearched(false);
                  setResult(undefined);
                  setQuery(STARTER_QUERY);
                  setStatus(undefined);
                }}
              >
                Start over
              </button>
            ) : null}
          </div>
          <p className="hint">
            Ollama structures your request locally. Seats.aero provides cached award availability.
          </p>
        </div>
      </section>

      {status ? <div className={`status ${status.tone}`} role="status">{status.text}</div> : null}

      {result ? (
        <section className="section" aria-labelledby="results-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SEARCH CONTEXT</p>
              <h2 id="results-title">Best matches</h2>
              <div className="tag-row">
                {searchTags(result).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
            </div>
            <span className={`provider-pill ${result.provider.live ? "live" : "demo"}`}>
              {result.provider.live ? "Cached provider data" : "Demo data"}
            </span>
          </div>
          {result.interpretation ? (
            <p className="interpretation-note">
              <strong>
                {result.interpretation.engine === "ollama"
                  ? `Parsed locally with ${result.interpretation.model}`
                  : "Deterministic parser"}
              </strong>
              <span>{result.interpretation.message}</span>
            </p>
          ) : null}
          {result.decisioning ? (
            <p className="decision-note">
              <strong>{result.decisioning.engine === "jev" ? "Jev decisioning" : "Deterministic decisioning"}:</strong>{" "}
              {result.decisioning.message}
            </p>
          ) : null}


          {result.offers.length === 0 ? (
            <div className="empty-state">
              <h3>No matching seats yet</h3>
              <p>Turn on alerts and Ruffi will keep checking this request.</p>
            </div>
          ) : (
            <div className="offer-list">
              {result.offers.slice(0, 8).map((offer, index) => (
                <OfferCard key={offer.id} offer={offer} rank={index + 1} />
              ))}
            </div>
          )}

          <details className="assumptions">
            <summary>How Ruffi understood this request</summary>
            <ul>
              {result.intent.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      <section id="wallet" className="section two-column">
        <div>
          <p className="eyebrow">YOUR WALLET</p>
          <h2>Points Ruffi can work with</h2>
          <p className="section-copy">
            Balances stay encrypted on this computer. Ruffi never transfers points without you.
          </p>
          <p className="setup-note">
            Live search needs a Seats.aero Pro key in Ruffi&apos;s protected local credential file.
          </p>
        </div>
        <div className="panel">
          <label htmlFor="home-airports">Home airports</label>
          <input
            id="home-airports"
            value={state.wallet.homeAirports.join(", ")}
            onChange={(event) =>
              setState({
                ...state,
                wallet: {
                  ...state.wallet,
                  homeAirports: event.target.value
                    .split(",")
                    .map((value) => value.trim().toUpperCase()),
                },
              })
            }
          />
          <div className="balance-list">
          <label htmlFor="preference-notes">What matters when Ruffi chooses?</label>
          <textarea
            id="preference-notes"
            className="preference-notes"
            value={state.preferenceNotes}
            onChange={(event) =>
              setState({ ...state, preferenceNotes: event.target.value })
            }
            maxLength={2000}
            rows={4}
            placeholder="I prefer nonstop flights, dislike high surcharges, and would rather save Chase points when Amex works just as well."
          />
          <p className="hint">Jev runs only after Ruffi applies hard search and wallet constraints.</p>
            {state.wallet.balances.map((balance) => {
              const program = programsById.get(balance.programId);
              if (!program) return null;
              return (
                <label className="balance-row" key={balance.programId}>
                  <span>
                    <strong>{program.shortName}</strong>
                    <small>{program.kind === "bank" ? "Transferable" : "Airline miles"}</small>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={balance.balance}
                    onChange={(event) => {
                      const nextBalance = Math.max(0, Math.round(Number(event.target.value) || 0));
                      setState({
                        ...state,
                        wallet: {
                          ...state.wallet,
                          balances: state.wallet.balances.map((item) =>
                            item.programId === balance.programId
                              ? { ...item, balance: nextBalance }
                              : item
                          ),
                        },
                      });
                    }}
                  />
                </label>
              );
            })}
          </div>
          {unusedPrograms.length > 0 ? (
            <div className="add-program">
              <select value={newProgram} onChange={(event) => setNewProgram(event.target.value)}>
                <option value="">Add another program...</option>
                {unusedPrograms.map((program) => (
                  <option key={program.id} value={program.id}>{program.name}</option>
                ))}
              </select>
              <button
                className="quiet-button"
                disabled={!newProgram}
                onClick={() => {
                  if (!newProgram) return;
                  setState({
                    ...state,
                    wallet: {
                      ...state.wallet,
                      balances: [...state.wallet.balances, { programId: newProgram, balance: 0 }],
                    },
                  });
                  setNewProgram("");
                }}
              >Add</button>
            </div>
          ) : null}
          <button className="primary full" onClick={() => saveState(state)}>Save wallet</button>
        </div>
      </section>

      <section id="watches" className="section two-column">
        <div>
          <p className="eyebrow">WATCHDOG</p>
          <h2>Ruffi keeps looking</h2>
          <p className="section-copy">
            Checks run while the local app is open. Email and text delivery need your own provider credentials.
          </p>
          <button className="secondary" onClick={checkWatches} disabled={checking}>
            {checking ? "Checking..." : "Check all now"}
          </button>
        </div>
        <div className="stack">
          <div className="panel notification-panel">
            <h3>Where should Ruffi alert you?</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={state.notifications.browser}
                onChange={(event) =>
                  setState({
                    ...state,
                    notifications: { ...state.notifications, browser: event.target.checked },
                  })
                }
              /> Browser notifications
            </label>
            <NotificationRow
              label="Email"
              type="email"
              enabled={state.notifications.emailEnabled}
              value={state.notifications.email ?? ""}
              placeholder="you@example.com"
              onEnabled={(emailEnabled) =>
                setState({ ...state, notifications: { ...state.notifications, emailEnabled } })
              }
              onValue={(email) =>
                setState({ ...state, notifications: { ...state.notifications, email } })
              }
            />
            <NotificationRow
              label="Text"
              type="tel"
              enabled={state.notifications.smsEnabled}
              value={state.notifications.phone ?? ""}
              placeholder="+12125551212"
              onEnabled={(smsEnabled) =>
                setState({ ...state, notifications: { ...state.notifications, smsEnabled } })
              }
              onValue={(phone) =>
                setState({ ...state, notifications: { ...state.notifications, phone } })
              }
            />
            <button
              className="quiet-button"
              onClick={() => saveState(state, "Alert settings saved locally.")}
            >Save alert settings</button>
          </div>

          {state.watches.length === 0 ? (
            <div className="empty-state">
              <h3>No watches yet</h3>
              <p>Search for a trip and choose “Turn on alerts.”</p>
            </div>
          ) : (
            state.watches.map((watch) => (
              <article className="watch-card" key={watch.id}>
                <div><strong>{watch.name}</strong><p>{watch.intent.rawQuery}</p></div>
                <div className="watch-meta">
                  <span>{watch.enabled ? "Watching" : "Paused"}</span>
                  <span>Next: {new Date(watch.nextCheckAt).toLocaleString()}</span>
                  <button className="text-button" onClick={() => removeWatch(watch)}>Remove</button>
                </div>
                {watch.lastError ? <p className="error-copy">{watch.lastError}</p> : null}
              </article>
            ))
          )}

          {state.alerts.slice(0, 5).map((alert) => (
            <article className="alert-card" key={alert.id}>
              <span>🐾</span>
              <div><strong>{alert.title}</strong><p>{alert.message}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="platform-strip">
        <div>
          <p className="eyebrow">LOCAL-FIRST</p>
          <h2>One search brain, multiple interfaces.</h2>
        </div>
        <PlatformStat value="Ollama" copy="Natural-language intent stays local" />
        <PlatformStat value="Seats.aero" copy="Cached award search and trip detail" />
        <PlatformStat value="MCP" copy="Local tools for other agents" />
      </section>
    </main>
  );
}

function NotificationRow(props: {
  label: string;
  type: "email" | "tel";
  enabled: boolean;
  value: string;
  placeholder: string;
  onEnabled: (enabled: boolean) => void;
  onValue: (value: string) => void;
}) {
  return (
    <div className="notification-row">
      <label className="check-row">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onEnabled(event.target.checked)}
        /> {props.label}
      </label>
      <input
        type={props.type}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onValue(event.target.value)}
      />
    </div>
  );
}

function PlatformStat({ value, copy }: { value: string; copy: string }) {
  return <div className="platform-stat"><strong>{value}</strong><span>{copy}</span></div>;
}

function OfferCard({ offer, rank }: { offer: RankedAwardOffer; rank: number }) {
  const departure = localClock(offer.departureTime);
  const arrival = localClock(offer.arrivalTime);
  const flights = offer.flightNumbers?.join(", ");
  const seatCopy =
    offer.seatCountKnown === false
      ? "Seat count not reported"
      : `${offer.seats} seat${offer.seats === 1 ? "" : "s"}`;
  return (
    <article className={`offer-card ${rank === 1 ? "best" : ""}`}>
      <div className="offer-top">
        <span className="rank">{rank === 1 ? "Best fit" : `#${rank}`}</span>
        <span className="program">{offer.loyaltyProgramName}</span>
      </div>
      <div className="offer-main">
        <div>
          <div className="route">
            <strong>{offer.origin}</strong><span>to</span><strong>{offer.destination}</strong>
          </div>
          <p className="flight-meta">
            {shortDate(offer.departureDate)}
            {departure ? ` · ${departure}${arrival ? ` to ${arrival}` : ""}` : ""}
            {flights ? ` · ${flights}` : ""}
          </p>
        </div>
        <div className="price">
          <strong>{points(offer.totalPoints)}</strong>
          <span>
            points
            {offer.taxesKnown === false
              ? " · fees unavailable"
              : ` + ${money(offer.totalTaxes, offer.currency)}`}
          </span>
        </div>
      </div>
      <div className="tag-row offer-tags">
        <span className="tag">{cabinName(offer.cabin)}</span>
        <span className="tag">{offer.stops === 0 ? "Nonstop" : `${offer.stops} stop${offer.stops === 1 ? "" : "s"}`}</span>
        <span className="tag">{seatCopy}</span>
        {offer.carriers?.length ? <span className="tag">{offer.carriers.join(", ")}</span> : null}
      </div>
      <div className={`funding ${offer.funding.covered ? "covered" : "short"}`}>
        <span>{offer.funding.covered ? "✓" : "!"}</span><p>{offer.funding.summary}</p>
      </div>
      <ul className="reason-list">
        {offer.reasons.slice(1).map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      {offer.bookingUrl ? (
        <a className="detail-link" href={offer.bookingUrl} target="_blank" rel="noreferrer">
          Review this option ↗
        </a>
      ) : null}
      <p className="source-meta">
        Source: {offer.provider === "seats_aero" ? "Seats.aero" : offer.provider} · Updated{" "}
        {new Date(offer.lastSeenAt).toLocaleString()}
      </p>
    </article>
  );
}

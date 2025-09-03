import React, { useEffect, useRef, useState } from "react";
import "./App.css";

const PAGE_SIZE = 20;
const MAX_COINS = 100;

export default function App() {
    // ukladame Mapu symbol -> coinObject (stabilne kluce pre neskorsie WS update)
    const [coinsMap, setCoinsMap] = useState(new Map());
    const [highlight, setHighlight] = useState({});
    const [page, setPage] = useState(0);
    const prevPricesRef = useRef(new Map());
    const timeoutsRef = useRef(new Map());

    // FETCH 100 coinov z CoinGecko (raz pri mount)
    useEffect(() => {
        let isMounted = true; // guard proti nastaveni stavu po unmount
        async function load() {
            try {
                // CoinGecko endpoint, 100 coinov, zoradene podla market cap
                const url =
                    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false";
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json(); // pole objektov (length <= 100)

                // Prevedieme pole na Mapu: kľúč = symbol uppercase (napr. BTC)
                const m = new Map();
                data.forEach((item) => {
                    const sym = (item.symbol || "").toUpperCase();
                    m.set(sym, {
                        s: sym, // symbol
                        name: item.name || "",
                        rank: item.market_cap_rank || null,
                        c: Number(item.current_price ?? NaN),
                        change24h: Number(
                            item.price_change_percentage_24h ?? NaN
                        ),
                    });
                    // ulozeme aj do prevPricesRef aby sme mali referenciu pred nasimi WS updatami
                    prevPricesRef.current.set(
                        sym,
                        Number(item.current_price ?? NaN)
                    );
                });

                if (isMounted) {
                    // udrziavame mapu v setCoinsMap
                    setCoinsMap(m);
                    setPage(0); // reset na prvu stranku
                }
            } catch (err) {
                console.error("Failed to load coins:", err);
            }
        }

        load();

        // cleanup
        return () => {
            isMounted = false;
            // zrus timeouts ak nejake su
            for (const t of timeoutsRef.current.values()) clearTimeout(t);
            timeoutsRef.current.clear();
        };
    }, []);

    // Ziskaj pole mincí v stabilnom poradí (podla rank ascend)
    const coins = Array.from(coinsMap.values()).sort((a, b) => {
        // ak rank existuje pouzij ho, inak fallback na symbol
        const ra = a.rank ?? Number.MAX_SAFE_INTEGER;
        const rb = b.rank ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.s.localeCompare(b.s);
    });

    // Stránkovanie
    const pageCount = Math.ceil(MAX_COINS / PAGE_SIZE);
    const pagedCoins = coins.slice(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE
    );

    // Helper pre pekne formatovanie meny a percent
    const fmtPrice = (v) =>
        Number.isFinite(v)
            ? new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
              }).format(v)
            : "-";
    const fmtPercent = (v) => (Number.isFinite(v) ? `${v.toFixed(2)} %` : "-");

    return (
        <div
            className="container"
            style={{ padding: 16, fontFamily: "system-ui, Arial, sans-serif" }}
        >
            <h1>📈 Crypto Tracker </h1>

            <p style={{ marginTop: 6 }}>
                Zobrazeno: {coins.length} coinů. Stránka {page + 1} /{" "}
                {pageCount}
            </p>

            <div style={{ marginBottom: 12 }}>
                {/* jednoduché stránkovanie */}
                {Array.from({ length: pageCount }).map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setPage(i)}
                        style={{
                            marginRight: 6,
                            padding: "6px 10px",
                            cursor: "pointer",
                            background: page === i ? "#111827" : "#ffffff",
                            color: page === i ? "#fff" : "#111827",
                            border: "1px solid #e5e7eb",
                            borderRadius: 4,
                        }}
                    >
                        {i + 1}
                    </button>
                ))}
            </div>

            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 14,
                }}
            >
                <thead>
                    <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                        <th style={{ padding: 8 }}>Rank</th>
                        <th style={{ padding: 8 }}>Zkratka</th>
                        <th style={{ padding: 8 }}>Název</th>
                        <th style={{ padding: 8 }}>Cena</th>
                        <th style={{ padding: 8 }}>Změna 24h</th>
                    </tr>
                </thead>
                <tbody>
                    {pagedCoins.map((c) => {
                        const bg =
                            highlight[c.s] === "up"
                                ? "#15ff00ff"
                                : highlight[c.s] === "down"
                                ? "#ff0000ff"
                                : undefined;
                        return (
                            <tr
                                key={c.s}
                                style={{
                                    background: bg,
                                    transition: "background 0.5s ease",
                                }}
                            >
                                <td style={{ padding: 8 }}>{c.rank ?? "-"}</td>
                                <td style={{ padding: 8 }}>{c.s}</td>
                                <td style={{ padding: 8 }}>{c.name}</td>
                                <td style={{ padding: 8 }}>{fmtPrice(c.c)}</td>
                                <td style={{ padding: 8 }}>
                                    {fmtPercent(c.change24h)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

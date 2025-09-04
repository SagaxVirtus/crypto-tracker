import React, { useEffect, useRef, useState } from "react";
import "./App.css";

const PAGE_SIZE = 20;
// Symboly podľa CoinGecko (bez USDT)
const trackedSymbols = ["BTC", "ETH", "ADA", "DOT", "XRP"];

export default function App() {
    // ukladame Mapu symbol -> coinObject (stabilne kluce pre neskorsie WS update)
    const [coinsMap, setCoinsMap] = useState(new Map());
    const [highlight, setHighlight] = useState({});
    const [page, setPage] = useState(0);
    const prevPricesRef = useRef(new Map());
    const timeoutsRef = useRef(new Map());

    // Načítanie coinov z CoinGecko
    useEffect(() => {
        let isMounted = true; // guard proti nastaveni stavu po unmount
        async function load() {
            try {
                // CoinGecko endpoint, 100 coinov, zoradene podla market cap
                const url =
                    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=107&page=1&sparkline=false";
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                // Mapuj podľa symbolu (BTC, ETH, USDT, ...)
                const m = new Map();
                data.forEach((item) => {
                    const sym = (item.symbol || "").toUpperCase();
                    m.set(sym, {
                        s: sym,
                        id: item.id,
                        name: item.name || "",
                        rank: item.market_cap_rank || null,
                        c: Number(item.current_price ?? NaN),
                        change24h: Number(
                            item.price_change_percentage_24h ?? NaN
                        ),
                    });
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

    // WebSocket na aktualizáciu tracked mincí
    useEffect(() => {
        // WebSocket adresa — spojíme viaceré streamy dokopy
        // Binance používa "BTCUSDT", "ETHUSDT", ...
        const streams = trackedSymbols
            .map((s) => (s + "USDT").toLowerCase() + "@trade")
            .join("/");
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

        ws.onopen = () => console.log("✅ WS opened");

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const symbol = data.s; // napr. "BTCUSDT"
            const baseSymbol = symbol.replace("USDT", ""); // napr. "BTC"
            const newPrice = Number(data.p);

            setCoinsMap((oldMap) => {
                const m = new Map(oldMap);
                const coin = m.get(baseSymbol);
                if (!coin) return oldMap;

                const prev = prevPricesRef.current.get(coin.s);
                if (prev !== undefined && prev !== newPrice) {
                    const direction = newPrice > prev ? "up" : "down";
                    setHighlight((h) => ({ ...h, [coin.s]: direction }));

                    // nastavenie timeoutu na zmazanie highlightu
                    if (timeoutsRef.current.get(coin.s)) {
                        clearTimeout(timeoutsRef.current.get(coin.s));
                    }
                    const tid = setTimeout(() => {
                        setHighlight((h) => {
                            const copy = { ...h };
                            delete copy[coin.s];
                            return copy;
                        });
                        timeoutsRef.current.delete(coin.s);
                    }, 600);
                    timeoutsRef.current.set(coin.s, tid);
                }

                prevPricesRef.current.set(coin.s, newPrice);

                // aktualizuj cenu v mape
                m.set(coin.s, { ...coin, c: newPrice });
                return m;
            });
        };

        ws.onerror = (err) => console.error("WS error:", err);
        ws.onclose = () => console.log("❌ WS closed");

        return () => ws.close();
    }, []);

    // Získaj pole mincí v stabilnom poradí (podľa ranku)
    const coins = Array.from(coinsMap.values()).sort((a, b) => {
        const ra = a.rank ?? Number.MAX_SAFE_INTEGER;
        const rb = b.rank ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.s.localeCompare(b.s);
    });

    // Aktívne sledované podľa symbolu (BTC, ETH, ...)
    const trackedSet = new Set(trackedSymbols);
    const activeCoins = coins.filter((c) => trackedSet.has(c.s));
    // Ostatné (vrátane USDT)
    const otherCoins = coins.filter((c) => !trackedSet.has(c.s));

    // Výpis len raz po načítaní CoinGecko dát
    useEffect(() => {
        if (coins.length > 0) {
            console.log("=== ALL COINS (sorted) ===");
            console.table(
                coins.map((c) => ({
                    symbol: c.s,
                    rank: c.rank,
                    name: c.name,
                }))
            );

            console.log("=== OTHER COINS (v spodnej tabuľke) ===");
            console.table(
                otherCoins.map((c) => ({
                    symbol: c.s,
                    rank: c.rank,
                    name: c.name,
                }))
            );
        }
        // eslint-disable-next-line
    }, [coinsMap]); // spustí sa len keď sa načítajú nové dáta do coinsMap

    // Stránkovanie
    const pageCount = Math.ceil(otherCoins.length / PAGE_SIZE);
    const pagedCoins = otherCoins.slice(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE
    );

    // Helper pre pekné formátovanie meny a percent
    const fmtPrice = (v) => (Number.isFinite(v) ? v.toFixed(4) : "-");
    const fmtPercent = (v) => (Number.isFinite(v) ? `${v.toFixed(5)} %` : "-");

    return (
        <div className="container">
            <h1>📈 Crypto Tracker</h1>

            <h2>🔥 Aktívne sledované krypto</h2>
            <table className="table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Zkratka</th>
                        <th>Název</th>
                        <th>Cena</th>
                        <th>Změna 24h</th>
                    </tr>
                </thead>
                <tbody>
                    {activeCoins.map((c) => {
                        let rowClass = "";
                        if (highlight[c.s] === "up") rowClass = "highlight-up";
                        else if (highlight[c.s] === "down")
                            rowClass = "highlight-down";
                        return (
                            <tr key={c.s} className={rowClass}>
                                <td data-label="Rank">{c.rank ?? "-"}</td>
                                <td data-label="Zkratka">{c.s}</td>
                                <td data-label="Název">{c.name}</td>
                                <td data-label="Cena">{fmtPrice(c.c)}</td>
                                <td data-label="Změna 24h">
                                    {fmtPercent(c.change24h)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <h2>Ostatné krypto</h2>
            <p>
                Zobrazeno: {otherCoins.length} coinů. Stránka {page + 1} /{" "}
                {pageCount}
            </p>
            <div className="pagination">
                {Array.from({ length: pageCount }).map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`page-btn${page === i ? " active" : ""}`}
                    >
                        {i + 1}
                    </button>
                ))}
            </div>
            <table className="table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Zkratka</th>
                        <th>Název</th>
                        <th>Cena</th>
                        <th>Změna 24h</th>
                    </tr>
                </thead>
                <tbody>
                    {pagedCoins.map((c) => (
                        <tr key={c.id}>
                            <td data-label="Rank">{c.rank ?? "-"}</td>
                            <td data-label="Zkratka">{c.s}</td>
                            <td data-label="Název">{c.name}</td>
                            <td data-label="Cena">{fmtPrice(c.c)}</td>
                            <td data-label="Změna 24h">
                                {fmtPercent(c.change24h)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

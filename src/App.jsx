import { useEffect, useState } from "react";

export default function App() {
    // stav pre cenu
    const [price, setPrice] = useState(null);
    const [quantity, setQuantity] = useState(null);

    useEffect(() => {
        // pripojenie na Binance WS (BTC/USDT trades)
        const ws = new WebSocket(
            "wss://stream.binance.com:9443/ws/!miniTicker@arr"
        );

        // keď príde správa
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // "p" = cena (string)
            setPrice(data.p);
            setQuantity(data.q);
        };

        // chyba
        ws.onerror = (err) => {
            console.error("Chyba WebSocket:", err);
        };

        // cleanup pri unmount
        return () => ws.close();
    }, []);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold">Crypto Tracker (Binance WS)</h1>
            {price ? (
                <p className="text-xl mt-4">
                    Aktuálna cena BTC/USDT:{" "}
                    <b>{parseFloat(price).toFixed(2)} $</b> <br />
                    Mnozstvo: <b>{parseFloat(quantity).toFixed(7)}</b>
                </p>
            ) : (
                <p>Načítavam data...</p>
            )}
        </div>
    );
}

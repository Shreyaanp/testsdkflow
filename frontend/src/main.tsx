import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WalletProviders } from "./providers/WalletProviders";
import { OAuthPage } from "./routes/OAuth";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/oauth" element={<OAuthPage />} />
          <Route path="*" element={<Navigate to="/oauth" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProviders>
  </React.StrictMode>
);

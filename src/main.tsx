import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

Office.onReady((info) => {
  if (info.host !== Office.HostType.PowerPoint) {
    document.body.innerHTML =
      '<p style="padding:20px;font-family:sans-serif;color:#7a7060">Please <a href="https://learn.microsoft.com/office/dev/add-ins/testing/test-debug-office-add-ins#sideload-an-office-add-in-for-testing" target="_blank" rel="noopener noreferrer">sideload</a> the add-in to continue.</p>';
    return;
  }

  const root = document.getElementById("root");
  if (!root) return;

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

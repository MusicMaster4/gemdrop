import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, LoaderCircle, RefreshCw } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from "./lib/native";
import { getLibraryController } from "./hooks/useLibrary";
import { version as sourceVersion } from "../package.json";

export function UpdateControl() {
  const [version, setVersion] = useState(sourceVersion);
  const [state, setState] = useState<
    "idle" | "checking" | "available" | "installing" | "current" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const updateRef = useRef<Update | null>(null);
  useEffect(() => {
    if (isDesktop())
      void getVersion()
        .then(setVersion)
        .catch(() => {});
    return () => {
      void updateRef.current?.close().catch(() => {});
    };
  }, []);
  async function checkUpdates() {
    setState("checking");
    setMessage("");
    try {
      await updateRef.current?.close();
      const { check } = await import("@tauri-apps/plugin-updater");
      updateRef.current = await check({ timeout: 20000 });
      setState(updateRef.current ? "available" : "current");
      setMessage(
        updateRef.current
          ? `Versão ${updateRef.current.version} disponível.`
          : "Você está na versão mais recente.",
      );
    } catch {
      setState("error");
      setMessage("Não foi possível verificar. Tente novamente mais tarde.");
    }
  }
  async function installUpdate() {
    if (!updateRef.current) return;
    setState("installing");
    setMessage("Baixando atualização…");
    let total = 0;
    let received = 0;
    try {
      const library = getLibraryController();
      await library.stopGeneration();
      await library.flush();
      if (library.getSnapshot().persistenceError)
        throw new Error("Save failed");
      await updateRef.current.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setMessage(
            total
              ? `Baixando… ${Math.min(100, Math.round((received / total) * 100))}%`
              : "Baixando atualização…",
          );
        }
        if (event.event === "Finished") setMessage("Instalando atualização…");
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setState("error");
      setMessage(
        "Não foi possível atualizar. Verifique sua conexão e tente novamente.",
      );
    }
  }
  const busy = state === "checking" || state === "installing";
  return (
    <div className="settings-section">
      <div className="setting-row">
        <div>
          <h3>Gemdrop {version}</h3>
          <p>
            {version.includes("-testing.") ? "Canal beta" : "Canal estável"}
          </p>
        </div>
        {isDesktop() && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void (state === "available" ? installUpdate() : checkUpdates())
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : state === "available" ? (
              <ArrowDownToLine size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
            {state === "available"
              ? "Instalar e reiniciar"
              : state === "installing"
                ? "Instalando…"
                : "Verificar atualização"}
          </button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={state === "error" ? "error-message" : "field-help"}
        >
          {message}
        </p>
      )}
    </div>
  );
}

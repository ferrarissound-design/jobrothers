import "./style.css";
import { Game } from "./Game";

declare global {
  interface Window {
    __jbBooted?: boolean;
    __jbShowBootError?: (message: string) => void;
  }
}

try {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  const uiRoot = document.getElementById("ui-root") as HTMLElement | null;

  if (!canvas || !uiRoot) {
    throw new Error("Required DOM elements (#game-canvas, #ui-root) were not found.");
  }

  const game = new Game(canvas, uiRoot);
  game.start();
  window.__jbBooted = true;
} catch (err) {
  window.__jbShowBootError?.(`初期化中にエラーが発生しました:\n\n${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  throw err;
}

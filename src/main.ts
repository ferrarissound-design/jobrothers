import "./style.css";
import { Game } from "./Game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
const uiRoot = document.getElementById("ui-root") as HTMLElement | null;

if (!canvas || !uiRoot) {
  throw new Error("Required DOM elements (#game-canvas, #ui-root) were not found.");
}

const game = new Game(canvas, uiRoot);
game.start();

import { openDB } from "idb";
import { reduceGame, type Game, type Action } from "./game";
const db = openDB("magical-banana-v1", 1, {
  upgrade(db) {
    db.createObjectStore("games", { keyPath: "id" });
    db.createObjectStore("audio");
  },
});
export async function saveGame(g: Game) {
  await (await db).put("games", g);
}
export async function allGames(): Promise<Game[]> {
  return (await (await db).getAll("games")).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}
export async function saveAudio(id: string, blob: Blob) {
  await (await db).put("audio", blob, id);
}
export async function getAudio(id: string): Promise<Blob | undefined> {
  return (await db).get("audio", id);
}

export async function patchGame(
  id: string,
  action: Action,
): Promise<Game | undefined> {
  const transaction = (await db).transaction("games", "readwrite");
  const old = await transaction.store.get(id);
  if (!old) {
    await transaction.done;
    return;
  }
  const updated = reduceGame(old, action);
  await transaction.store.put(updated);
  await transaction.done;
  return updated;
}

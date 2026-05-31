export async function gitRead(env: any, path: string): Promise<string> {
  const resp = await fetch(
    `https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/${path}`,
    { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` } }
  );
  if (!resp.ok) throw new Error(`GitHub read ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.content || "";
}

export async function gitPush(env: any, path: string, content: string, message: string): Promise<void> {
  const existing = await fetch(
    `https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/${path}`,
    { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` } }
  );
  const sha = existing.ok ? (await existing.json()).sha : null;
  const body: any = {
    message,
    content: btoa(content),
    ...(sha ? { sha } : {}),
  };
  const resp = await fetch(
    `https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/${path}`,
    { method: "PUT", headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!resp.ok) throw new Error(`GitHub push ${resp.status}: ${await resp.text()}`);
}

export async function webSearch(query: string): Promise<string> {
  const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Saraha-Brain/1.0" },
  });
  const html = await resp.text();
  const results: string[] = [];
  const re = /class="result__snippet">([^<]+)</g;
  let m;
  while ((m = re.exec(html)) && results.length < 5) {
    results.push(m[1].replace(/<[^>]+>/g, ""));
  }
  return results.length ? results.join("\n") : "No results.";
}

export async function fetchURL(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { "User-Agent": "Saraha-Brain/1.0" } });
  const text = await resp.text();
  return text.slice(0, 4000);
}

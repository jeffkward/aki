import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { app } from "../app/app";
import { APP_NAME } from "../app/lib/layout";

/* Route-level tests with no server running and a real database —
   Rails' request specs, minus the setup. */

const form = (o: Record<string, string>) => new URLSearchParams(o);
// hono/jsx escapes text the way any HTML renderer must; a name like Tom's Kanban
// arrives as Tom&#39;s Kanban, so compare against the escaped form.
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const NAME = esc(APP_NAME);

describe("widgets", () => {
  it("GET /widgets renders the index", async () => {
    const res = await app.request("/widgets");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Widgets");
  });

  it("POST /widgets creates and returns the row fragment", async () => {
    const res = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Sprocket", description: "Turns things", price: "19.99" }),
    });
    expect(res.status).toBe(201);
    const html = await res.text();
    expect(html).toContain("Sprocket");
    expect(html).toStartWith("<tr");
  });

  it("stores money as integer cents, not a float", async () => {
    const res = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Priced", price: "19.99" }),
    });
    // 19.99 as a float is 19.989999999999998 — this must come back exactly.
    expect(await res.text()).toContain("$19.99");
  });

  it("rejects a blank name (Zod, before any handler runs) and says which field", async () => {
    const res = await app.request("/widgets", { method: "POST", body: form({ name: "" }) });
    expect(res.status).toBe(400);
    // a refusal with no reason sends the next person to the source
    expect(await res.text()).toContain('"name"');
  });

  it("rejects a negative price", async () => {
    const res = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Bad", price: "-5" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /widgets/:id shows one, 404s for a missing one", async () => {
    const created = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Showable", price: "1" }),
    });
    const id = (await created.text()).match(/id="widget-(\d+)"/)?.[1];
    expect((await app.request(`/widgets/${id}`)).status).toBe(200);
    expect((await app.request("/widgets/999999")).status).toBe(404);
  });

  it("DELETE /widgets/:id removes the row", async () => {
    const created = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Temporary", price: "0" }),
    });
    const id = (await created.text()).match(/id="widget-(\d+)"/)?.[1];
    expect((await app.request(`/widgets/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(await (await app.request("/widgets")).text()).not.toContain(`id="widget-${id}"`);
  });

  it("hides the hint by CSS too, for the HTMX case", () => {
    // the first row arrives without a page reload, so the server-rendered
    // message would go stale — the :has() rule is what covers that
    const css = readFileSync("app/components/table.css", "utf8");
    expect(css).toContain(":has(tbody tr)");
  });

  it("sets created_at automatically", async () => {
    const res = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Stamped", price: "0" }),
    });
    expect(await res.text()).toContain("<time");
  });
});

describe("landing page", () => {
  it("welcomes you and links to both examples", async () => {
    const html = await (await app.request("/")).text();
    // APP_NAME rather than a literal: this file survives `rename --keep-example`,
    // and a fresh app must not start with a red suite because of its own name.
    // The name reaching the page is behaviour; the sentence around it is copy.
    expect(html).toContain(NAME);
    expect(html).toContain('href="/theme"');
    expect(html).toContain('href="/widgets"');
    expect(html).toContain('src="/icon.svg"');
  });

  it("titles pages with the app's display name", async () => {
    expect(await (await app.request("/")).text()).toContain(`<title>${NAME}</title>`);
    expect(await (await app.request("/widgets")).text()).toContain(
      `<title>Widgets — ${NAME}</title>`,
    );
    expect(await (await app.request("/theme")).text()).toContain(
      `<title>Theme — ${NAME}</title>`,
    );
  });

  it("serves the icon", async () => {
    const res = await app.request("/icon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("bundled assets revalidate instead of being cached blindly", async () => {
    for (const path of ["/icon.svg", "/app.css", "/htmx.min.js"]) {
      const res = await app.request(path);
      const etag = res.headers.get("etag");
      expect(etag).toBeTruthy();
      expect(res.headers.get("cache-control")).toBe("no-cache");
      // a matching ETag must short-circuit to 304, not re-send the body
      const again = await app.request(path, { headers: { "If-None-Match": etag as string } });
      expect(again.status).toBe(304);
      // a stale ETag must get the real thing
      const stale = await app.request(path, { headers: { "If-None-Match": '"nope"' } });
      expect(stale.status).toBe(200);
    }
  });
});

describe("theme gallery", () => {
  it("honours ?theme= and ?mode=", async () => {
    const html = await (await app.request("/theme?theme=den&mode=dark")).text();
    expect(html).toContain('data-theme="den"');
    expect(html).toContain('data-mode="dark"');
  });
});

describe("navigation", () => {
  it("every page below the root has a breadcrumb to its parent", async () => {
    const created = await app.request("/widgets", {
      method: "POST",
      body: form({ name: "Crumbed", price: "1" }),
    });
    const id = (await created.text()).match(/id="widget-(\d+)"/)?.[1];
    // page -> where its crumb must point. A member page goes up to its
    // collection, not to the root. The structure is asserted, not the label:
    // the word on the link is copy.
    const parents: Record<string, string> = {
      "/widgets": "/",
      [`/widgets/${id}`]: "/widgets",
      "/theme": "/",
    };
    for (const [path, parent] of Object.entries(parents)) {
      const html = await (await app.request(path)).text();
      expect(html).toMatch(new RegExp(`class="crumb"[\\s\\S]*?href="${parent}"`));
    }
  });
});

describe("widgets, as a sequence", () => {
  /* The tests above each prove one operation on one fresh row. Nothing proves
     the composition: that deleting one row leaves its neighbour alone, that
     the list and the show page agree at every step, and that the empty state
     comes back when the last row goes. This is the driver that does. It runs
     last in the file and starts by clearing whatever the tests above left. */
  const ids = (html: string) => [...html.matchAll(/id="widget-(\d+)"/g)].map((m) => m[1]);
  const index = async () => (await app.request("/widgets")).text();
  const create = async (name: string) => {
    const res = await app.request("/widgets", {
      method: "POST",
      body: form({ name, price: "1" }),
    });
    expect(res.status).toBe(201);
    return ids(await res.text())[0] as string;
  };
  const status = async (path: string, init?: RequestInit) =>
    (await app.request(path, init)).status;

  it("create two, delete one, delete the other: list, show and empty state agree throughout", async () => {
    for (const id of ids(await index())) {
      expect(await status(`/widgets/${id}`, { method: "DELETE" })).toBe(200);
    }
    let html = await index();
    expect(ids(html)).toEqual([]);
    expect(html).toContain('class="sub empty-hint"');

    const a = await create("Alpha");
    const b = await create("Beta");
    expect(a).not.toBe(b);
    html = await index();
    expect(ids(html).sort()).toEqual([a, b].sort());
    expect(html).not.toContain("empty-hint");
    expect(await status(`/widgets/${a}`)).toBe(200);
    expect(await status(`/widgets/${b}`)).toBe(200);

    expect(await status(`/widgets/${a}`, { method: "DELETE" })).toBe(200);
    html = await index();
    expect(ids(html)).toEqual([b]);
    expect(html).not.toContain("empty-hint");
    expect(await status(`/widgets/${a}`)).toBe(404);
    expect(await status(`/widgets/${b}`)).toBe(200);

    expect(await status(`/widgets/${b}`, { method: "DELETE" })).toBe(200);
    html = await index();
    expect(ids(html)).toEqual([]);
    expect(html).toContain('class="sub empty-hint"');
    expect(await status(`/widgets/${b}`)).toBe(404);
  });
});

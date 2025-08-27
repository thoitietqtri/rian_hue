// netlify/functions/proxy.js
export async function handler(event) {
  try {
    const base = "http://203.209.181.170:2018/API_TTB/JSON/solieu.php"; // API nội bộ
    const qs = event.rawQuery ? `?${event.rawQuery}` : "";

    const resp = await fetch(base + qs, { method: "GET" });
    const text = await resp.text(); // API trả HTML/table

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
      body: text,
    };
  } catch (e) {
    return { statusCode: 500, body: e.message || "Proxy Error" };
  }
}

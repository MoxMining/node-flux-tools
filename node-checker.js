const http = require("http");
const net = require("net");

const PORTS = [16127, 16137, 16147, 16157, 16167, 16177, 16187, 16197];
const CHECKS = ["db", "syncthing", "docker", "daemon", "udp", "hardware", "dos", "appsDos"];

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0))) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)) return false;
  return true;
}

function checkPort(ip, port) {
  return new Promise(resolve => {
    const req = http.get({
      hostname: ip, port, path: "/flux/health",
      agent: false, timeout: 4500,
      headers: { Accept: "application/json" }
    }, res => {
      let body = "";
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ port, error: "HTTP " + res.statusCode });
      }
      res.setEncoding("utf8");
      res.on("data", chunk => {
        body += chunk;
        if (body.length > 16384) res.destroy(new Error("Response too large"));
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (!json || typeof json.data !== "object" || json.data === null || Array.isArray(json.data)) {
            return resolve({ port, error: "Invalid health response" });
          }
          const checks = {};
          for (const key of CHECKS) checks[key] = typeof json.data[key] === "string" ? json.data[key] : "unknown";
          resolve({ port, status: json.status || "unknown", checks });
        } catch {
          resolve({ port, error: "Invalid JSON response" });
        }
      });
      res.on("error", () => resolve({ port, error: "Connection interrupted" }));
    });
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", err => resolve({ port, error: err.message === "Timeout" ? "Timed out" : "Unavailable" }));
  });
}

module.exports = function registerNodeChecker(app) {
  app.get("/api/node-check", async (req, res) => {
    const ip = typeof req.query.ip === "string" ? req.query.ip.trim() : "";
    if (!isPublicIPv4(ip)) return res.status(400).json({ error: "Enter a valid public IPv4 address." });
    res.set("Cache-Control", "no-store");
    const results = await Promise.all(PORTS.map(port => checkPort(ip, port)));
    res.json({ ip, results });
  });
};

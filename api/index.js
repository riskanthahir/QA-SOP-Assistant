process.env.VERCEL = "1";
let cachedApp = null;
async function getApp() {
  if (cachedApp) return cachedApp;
  try {
    const mod = await import("../server.js");
    cachedApp = mod.app || mod.default || mod;
    return cachedApp;
  } catch (err1) {
    try {
      const cjsMod = await import("../dist/server.cjs");
      cachedApp = cjsMod.app || cjsMod.default || cjsMod;
      return cachedApp;
    } catch (err2) {
      try {
        const tsMod = await import("../server.ts");
        cachedApp = tsMod.app || tsMod.default || tsMod;
        return cachedApp;
      } catch (err3) {
        console.error("[Vercel Serverless] Failed to load server app:", err1, err2, err3);
        throw new Error("Failed to resolve server instance: " + (err1?.message || err1));
      }
    }
  }
}
async function handler(req, res) {
  try {
    process.env.VERCEL = "1";
    const app = await getApp();
    const matchedPath = req.headers?.["x-matched-path"] || req.headers?.["x-vercel-matched-path"];
    if (matchedPath && typeof matchedPath === "string" && matchedPath.startsWith("/api")) {
      req.url = matchedPath;
    } else if (req.url && !req.url.startsWith("/api")) {
      req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
    }
    return app(req, res);
  } catch (fatalErr) {
    console.error("[Vercel API Handler Fatal Error]:", fatalErr);
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({
        error: `Server initialization error on Vercel: ${fatalErr?.message || fatalErr}. Please ensure build artifacts and environment variables are properly configured.`
      }));
    }
  }
}
export {
  handler as default
};

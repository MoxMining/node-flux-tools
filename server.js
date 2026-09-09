const express = require("express")
const { createProxyMiddleware } = require("http-proxy-middleware")

const app = express()
const PORT = process.env.PORT || 3000

// API-proksi for /api/*
app.use("/api", createProxyMiddleware({
  target: "https://api.runonflux.io",
  changeOrigin: true,
  pathRewrite: {
    "^/api": ""
  }
}))

// Static files
app.use(express.static(__dirname))

// Konfigurasjons-skjerm for nodes
app.get("/nodes-config", (req, res) => {
  res.json({
    proxyTarget: process.env.VITE_PROXY_TARGET || "https://api.runonflux.io"
  })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

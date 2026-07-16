const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const listEndpoints = require("express-list-endpoints");
require("dotenv").config();

const app = express();

/* =======================
   Database
======================= */
const connectDB = require("./config/db");

/* =======================
   Routes
======================= */
const UserRoutes = require("./routes/Users.routes");
const CompanyRoutes = require("./routes/Company.route");
const IDManagementRoutes = require("./routes/IDManagment.routes");
const IDvisitorRoutes = require("./routes/IDVisitor.routes");

/* =======================
   Middleware
======================= */
app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =======================
   Health Check
======================= */
app.get("/", (req, res) => {
  res.send("You are connected to Printsy server");
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
/* =======================
   API Routes
======================= */
app.use("/api/auth", UserRoutes);
app.use("/api/Company", CompanyRoutes);
app.use("/api/IDManage", IDManagementRoutes);
app.use("/api/IDVisitor", IDvisitorRoutes);
/* =======================
   🔥 ADD THIS: Route Listing API (DEV ONLY)
======================= */
if (process.env.NODE_ENV !== "production") {
  app.get("/api/routes", (req, res) => {
    res.json(listEndpoints(app));
  });
}

/* =======================
   Database Connection
======================= */
connectDB();

/* =======================
   Server Start
======================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);

  /* =======================
     List All Routes (Console)
  ======================= */
  if (process.env.NODE_ENV !== "production") {
    console.log("\n📂 ========== AVAILABLE ROUTES ==========\n");

    const routes = listEndpoints(app);

    routes.forEach((route, index) => {
      console.log(
        `${index + 1}. ${route.methods.join(", ").padEnd(8)} ${route.path}`,
      );
    });

    console.log(`\n✅ Total Routes: ${routes.length}`);
    console.log("\n========================================\n");
  }
});

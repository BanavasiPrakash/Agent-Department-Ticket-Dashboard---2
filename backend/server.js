const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Bottleneck = require("bottleneck");
const axiosRetry = require("axios-retry").default;
const http = require("http");
const WebSocket = require("ws");
const rateLimit = require("express-rate-limit");

const app = express();
const port = process.env.PORT || 5000;
const WEBHOOK_SECRET = process.env.ZOHO_WEBHOOK_SECRET || "your-secret-token";

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 http://192.168.3.8:5000"
  );
  next();
});

const clientId = "1000.VEPAX9T8TKDWJZZD95XT6NN52PRPQY";
const clientSecret = "acca291b89430180ced19660cd28ad8ce1e4bec6e8";
const refreshToken = "1000.465100d543b8d9471507bdf0b0263414.608f3f3817d11b09f142fd29810cca6f";

let cachedAccessToken = null;
let accessTokenExpiry = null;
const limiter = new Bottleneck({ minTime: 1100 });

axiosRetry(axios, {
  retries: 4,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    error.response && (error.response.status === 429 || error.response.status >= 500),
});

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && accessTokenExpiry && now < accessTokenExpiry) {
    return cachedAccessToken;
  }
  const params = new URLSearchParams();
  params.append("refresh_token", refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("grant_type", "refresh_token");

  const response = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  cachedAccessToken = response.data.access_token;
  accessTokenExpiry = now + (response.data.expires_in - 60) * 1000;
  return cachedAccessToken;
}

async function fetchAllTickets(accessToken, departmentIds = [], agentId = null) {
  let from = 1, limit = 100, allTickets = [];
  const deptIdsToFetch = departmentIds.length > 0 ? departmentIds : [null];
  for (const deptId of deptIdsToFetch) {
    let continueFetching = true, pageFrom = 1;
    while (continueFetching) {
      const params = { from: pageFrom, limit };
      if (deptId) params.departmentId = deptId;
      if (agentId) params.agentId = agentId;
      const response = await limiter.schedule(() =>
        axios.get("https://desk.zoho.com/api/v1/tickets", {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, params
        })
      );
      const ticketsBatch = response.data.data || [];
      allTickets = allTickets.concat(ticketsBatch);
      if (ticketsBatch.length < limit) continueFetching = false;
      else pageFrom += limit;
    }
  }
  return allTickets;
}

async function fetchAllUsers(accessToken) {
  let from = 1, limit = 100, allUsers = [];
  while (true) {
    const response = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/users", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, params: { from, limit }
      })
    );
    allUsers = allUsers.concat(response.data.data || []);
    if (response.data.data.length < limit) break;
    from += limit;
  }
  return allUsers;
}

async function fetchUsersByIds(accessToken, ids) {
  const users = [];
  for (const id of ids) {
    try {
      const response = await limiter.schedule(() =>
        axios.get(`https://desk.zoho.com/api/v1/users/${id}`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        })
      );
      users.push(response.data);
    } catch (err) {
      console.warn(`Could not fetch user ID ${id}:`, err.message);
    }
  }
  return users;
}

const statusMap = {
  open: "open", "on hold": "hold", hold: "hold", closed: "closed",
  "in progress": "inProgress", unassigned: "unassigned", "": "unassigned"
};

// CONTINUED in Part 2...
app.get("/api/zoho-assignees-with-ticket-counts", async (req, res) => {
  try {
    let departmentIds = [];
    if (req.query.departmentIds) {
      try { departmentIds = JSON.parse(req.query.departmentIds); }
      catch { departmentIds = [req.query.departmentIds]; }
    }
    const agentId = req.query.agentId || null;
    const accessToken = await getAccessToken();
    let users = await fetchAllUsers(accessToken);
    const tickets = await fetchAllTickets(accessToken, departmentIds, agentId);

    if (departmentIds.length > 0) {
      const ticketStatusCountMap = {}, latestUnassignedTicketIdMap = {}, allUnassignedTicketNumbers = [];
      for (const deptId of departmentIds) {
        ticketStatusCountMap[deptId] = { open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0 };
        latestUnassignedTicketIdMap[deptId] = null;
      }
      tickets.forEach((ticket) => {
        const deptId = ticket.departmentId || null;
        if (deptId && departmentIds.includes(deptId.toString())) {
          const rawStatus = (ticket.status || "").toLowerCase();
          const normalizedStatus = statusMap[rawStatus] || "unassigned";
          const isEscalated = ticket.isEscalated === true || String(ticket.escalated).toLowerCase() === "true";
          if (!ticketStatusCountMap[deptId]) {
            ticketStatusCountMap[deptId] = { open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0 };
            latestUnassignedTicketIdMap[deptId] = null;
          }
          if ((!ticket.assigneeId || ["null", "none", null].includes(ticket.assigneeId)) && normalizedStatus !== "closed") {
            const ticketNumber = ticket.ticketNumber || ticket.id;
            if (ticketNumber) allUnassignedTicketNumbers.push(ticketNumber);
            const currentLatest = latestUnassignedTicketIdMap[deptId];
            if (currentLatest === null ||
              (typeof currentLatest === "number" && ticketNumber > currentLatest) ||
              (typeof currentLatest === "string" && ticketNumber.localeCompare(currentLatest) > 0)
            ) latestUnassignedTicketIdMap[deptId] = ticketNumber;
          }
          if ((!ticket.assigneeId || ["null", "none", null].includes(ticket.assigneeId)) && normalizedStatus === "closed") return;
          if (!ticket.assigneeId || ["null", "none", null].includes(ticket.assigneeId)) ticketStatusCountMap[deptId].unassigned++;
          else if (normalizedStatus === "unassigned" || isEscalated) ticketStatusCountMap[deptId].escalated++;
          else if (normalizedStatus === "open") ticketStatusCountMap[deptId].open++;
          else if (normalizedStatus === "hold") ticketStatusCountMap[deptId].hold++;
          else if (normalizedStatus === "closed") ticketStatusCountMap[deptId].closed++;
          else if (normalizedStatus === "inProgress") ticketStatusCountMap[deptId].inProgress++;
        }
      });
      const response = await limiter.schedule(() =>
        axios.get("https://desk.zoho.com/api/v1/departments", {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        })
      );
      const allDepartments = response.data.data || [];
      const filteredDepartments = allDepartments.filter((dep) =>
        departmentIds.includes(dep.id.toString())
      );
      const members = filteredDepartments.map((dep) => ({
        id: dep.id,
        name: dep.name,
        tickets: ticketStatusCountMap[dep.id] || {
          open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0,
        },
        latestUnassignedTicketId: latestUnassignedTicketIdMap[dep.id] || null,
      }));
      return res.json({ members, unassignedTicketNumbers: allUnassignedTicketNumbers });
    }

    const allAssigneeIds = new Set(tickets.map((t) => t.assigneeId).filter(Boolean));
    const knownUserIds = new Set(users.map((u) => u.id));
    const missingUserIds = Array.from(allAssigneeIds).filter((id) => !knownUserIds.has(id));
    if (missingUserIds.length > 0) {
      const missingUsers = await fetchUsersByIds(accessToken, missingUserIds);
      users = users.concat(missingUsers);
    }
    const ticketStatusCountMap = {}, latestUnassignedTicketIdMap = {};
    users.forEach((user) => {
      ticketStatusCountMap[user.id] = {
        open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0,
      }; latestUnassignedTicketIdMap[user.id] = null;
    });
    ticketStatusCountMap["unassigned"] = {
      open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0
    };
    latestUnassignedTicketIdMap["unassigned"] = null;
    const allUnassignedTicketNumbers = [];
    tickets.forEach((ticket) => {
      const assigneeRaw = ticket.assigneeId === undefined || ticket.assigneeId === null ? "" : ticket.assigneeId.toString().toLowerCase();
      const isUnassignedAssignee = assigneeRaw === "" || assigneeRaw === "none" || assigneeRaw === "null";
      const assigneeId = isUnassignedAssignee ? "unassigned" : ticket.assigneeId;
      if (!ticketStatusCountMap[assigneeId]) {
        ticketStatusCountMap[assigneeId] = {
          open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0,
        }; latestUnassignedTicketIdMap[assigneeId] = null;
      }
      const rawStatus = (ticket.status || "").toLowerCase();
      const normalizedStatus = statusMap[rawStatus] || "unassigned";
      const isEscalated = ticket.isEscalated === true || String(ticket.escalated).toLowerCase() === "true";
      if (isUnassignedAssignee && normalizedStatus !== "closed") {
        const ticketNumber = ticket.ticketNumber || ticket.id;
        if (ticketNumber) allUnassignedTicketNumbers.push(ticketNumber);
        const currentLatest = latestUnassignedTicketIdMap[assigneeId];
        if (currentLatest === null ||
          (typeof currentLatest === "number" && ticketNumber > currentLatest) ||
          (typeof currentLatest === "string" && ticketNumber.localeCompare(currentLatest) > 0)
        ) latestUnassignedTicketIdMap[assigneeId] = ticketNumber;
      }
      if (isUnassignedAssignee && normalizedStatus === "closed") return;
      if (isUnassignedAssignee) ticketStatusCountMap["unassigned"].unassigned++;
      else if (normalizedStatus === "unassigned" || isEscalated) ticketStatusCountMap[assigneeId].escalated++;
      else if (normalizedStatus === "open") ticketStatusCountMap[assigneeId].open++;
      else if (normalizedStatus === "hold") ticketStatusCountMap[assigneeId].hold++;
      else if (normalizedStatus === "closed") ticketStatusCountMap[assigneeId].closed++;
      else if (normalizedStatus === "inProgress") ticketStatusCountMap[assigneeId].inProgress++;
    });
    users.push({
      id: "unassigned", fullName: "Unassigned", displayName: "Unassigned",
    });
    const members = users
      .filter((user) => user.id in ticketStatusCountMap)
      .map((user) => {
        let name = "Unknown";
        if (user.firstName && user.lastName) name = `${user.firstName} ${user.lastName}`;
        else if (user.fullName) name = user.fullName;
        else if (user.displayName) name = user.displayName;
        else if (user.name) name = user.name;
        else if (user.email) name = user.email;
        return {
          id: user.id, name,
          tickets: ticketStatusCountMap[user.id],
          latestUnassignedTicketId: latestUnassignedTicketIdMap[user.id] || null,
        };
      });
    res.json({ members, unassignedTicketNumbers: allUnassignedTicketNumbers });
  } catch (error) {
    console.error("API error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch assignee ticket counts" });
  }
});

app.get("/api/agent-departments/:agentId", async (req, res) => {
  try {
    const agentId = req.params.agentId;
    if (!agentId) return res.status(400).json({ error: "Missing agentId parameter" });
    const accessToken = await getAccessToken();
    const response = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/departments", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      })
    );
    const departments = response.data.data || [];
    const departmentsWithAgent = [];
    for (const department of departments) {
      try {
        const agentsResponse = await limiter.schedule(() =>
          axios.get(`https://desk.zoho.com/api/v1/departments/${department.id}/agents`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          })
        );
        const agents = agentsResponse.data.data || [];
        if (agents.some((agent) => agent.id === agentId)) {
          departmentsWithAgent.push({ id: department.id, name: department.name });
        }
      } catch (err) {
        console.error(`Error fetching agents for department ${department.id}:`, err.message);
      }
    }
    res.json({ departments: departmentsWithAgent });
  } catch (error) {
    console.error("API error in /api/agent-departments/:agentId:", error.message);
    res.status(500).json({ error: "Failed to get agent's departments" });
  }
});

app.get("/api/zoho-department-ticket-counts", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const depResp = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/departments", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      })
    );
    const departments = depResp.data.data || [];
    const tickets = await fetchAllTickets(accessToken);
    const ticketStatusCountMap = {};
    departments.forEach((dep) => {
      ticketStatusCountMap[dep.id] = { open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0 };
    });
    tickets.forEach((ticket) => {
      const deptId = ticket.departmentId;
      if (deptId && ticketStatusCountMap[deptId]) {
        const rawStatus = (ticket.status || "").toLowerCase();
        const normalizedStatus = statusMap[rawStatus] || "unassigned";
        const isEscalated = ticket.isEscalated === true || String(ticket.escalated).toLowerCase() === "true";
        if ((!ticket.assigneeId || ["null", "none", null].includes(ticket.assigneeId)) && normalizedStatus !== "closed") {
          ticketStatusCountMap[deptId].unassigned++;
        } else if (normalizedStatus === "unassigned" || isEscalated)
          ticketStatusCountMap[deptId].escalated++;
        else if (normalizedStatus === "open")
          ticketStatusCountMap[deptId].open++;
        else if (normalizedStatus === "hold")
          ticketStatusCountMap[deptId].hold++;
        else if (normalizedStatus === "closed")
          ticketStatusCountMap[deptId].closed++;
        else if (normalizedStatus === "inProgress")
          ticketStatusCountMap[deptId].inProgress++;
      }
    });
    const departmentTicketCounts = departments.map((dep) => ({
      id: dep.id,
      name: dep.name,
      tickets: ticketStatusCountMap[dep.id] || { open: 0, closed: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0 },
    }));
    res.json({ departmentTicketCounts });
  } catch (error) {
    console.error("API error in /api/zoho-department-ticket-counts:", error.message);
    res.status(500).json({ error: "Failed to get department ticket counts" });
  }
});

app.get("/api/zoho-departments", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const depResp = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/departments", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
      })
    );
    const departments = depResp.data.data || [];
    const departmentsWithAgents = await Promise.all(
      departments.map(async (dep) => {
        try {
          const agentsResp = await limiter.schedule(() =>
            axios.get(`https://desk.zoho.com/api/v1/departments/${dep.id}/agents`, {
              headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            })
          );
          const agents = (agentsResp.data.data || []).map(a =>
            a.displayName || a.fullName || a.name || a.email || "Unknown"
          );
          return { ...dep, agents };
        } catch (err) {
          return { ...dep, agents: [] };
        }
      })
    );
    res.json({ departments: departmentsWithAgents });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch departments with agents" });
  }
});

app.get("/", (req, res) => {
  res.send("Backend server running. Use API endpoints under /api.");
});

const webhookLimiter = rateLimit({ windowMs: 1000, max: 10, message: "Too many webhook requests, please try again later." });
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function noop() {}
function heartbeat() { this.isAlive = true; }
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);
  console.log("WebSocket client connected");
  ws.on("error", (error) => { console.error("WebSocket error:", error); });
  ws.on("close", (code, reason) => { console.log(`WebSocket closed: code=${code}, reason=${reason}`); });
});
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);

app.post("/webhook/zoho", webhookLimiter, (req, res) => {
  try {
    const token = req.headers["x-zoho-webhook-token"];
    if (token !== WEBHOOK_SECRET) return res.status(401).send("Unauthorized");
    const eventData = req.body;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(eventData));
    });
    res.status(200).send("Received");
  } catch (err) {
    res.status(500).send("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Backend server running on port ${port}`);
});

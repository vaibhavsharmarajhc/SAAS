/**
 * VSH Legal Practice Manager - Multi-Tenant Express Server
 * Core API Routes, JWT Authentication, and Static File Asset Server
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./server-db');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'vsh_secret_chambers_key_998877';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Initialize database
db.initDatabase();

/**
 * Authentication Middleware
 */
async function authenticateToken(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) {
    return res.status(401).json({ error: "Access denied. No session token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('session_token');
    return res.status(403).json({ error: "Invalid or expired session. Please log in again." });
  }
}

/**
 * Database Connection Status Endpoint
 */
app.get('/api/status', async (req, res) => {
  const isMongoConfigured = !!process.env.MONGODB_URI;
  const dbInstance = await db.getDb();
  const isMongoConnected = !!dbInstance;
  
  res.json({
    dbType: isMongoConfigured ? (isMongoConnected ? 'mongodb' : 'fallback-error') : 'local',
    connected: isMongoConnected
  });
});

// ================= AUTH ROUTES =================

/**
 * Register New Tenant (Signup)
 */
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, firmName, lawyerName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const existing = await db.getTenantByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "An account with this email address already exists." });
    }

    const tenant = await db.createTenant(email, password, firmName, lawyerName);

    // Create session token
    const token = jwt.sign({ id: tenant.id, email: tenant.email }, JWT_SECRET, { expiresIn: '30d' });

    // Set HttpOnly cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: false, // Set to true if running over HTTPS in production
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({ user: tenant });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message || "Failed to register account." });
  }
});

/**
 * Log In (Session Creation)
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const tenant = await db.getTenantByEmail(email);
    if (!tenant) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Verify Password
    const passwordValid = bcrypt.compareSync(password, tenant.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Create session token
    const token = jwt.sign({ id: tenant.id, email: tenant.email }, JWT_SECRET, { expiresIn: '30d' });

    // Set HttpOnly cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    const { passwordHash: _, ...safeTenant } = tenant;
    res.json({ user: safeTenant });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to authenticate login request." });
  }
});

/**
 * Forgot Password (Code Generation)
 */
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    const tenant = await db.getTenantByEmail(email);
    if (!tenant) {
      return res.status(404).json({ error: "No chamber is registered with this email address." });
    }

    // Generate random 6-digit recovery code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes from now

    await db.setTenantResetCode(email, resetCode, expires);

    res.json({ 
      success: true, 
      code: resetCode, 
      message: "A verification code has been generated. For testing, it is displayed below." 
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process forgot password request." });
  }
});

/**
 * Reset Password (Verification and Update)
 */
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: "All fields are required (email, verification code, new password)." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const newPasswordHash = bcrypt.hashSync(newPassword, salt);

    const success = await db.resetTenantPassword(email, code, newPasswordHash);
    if (!success) {
      return res.status(400).json({ error: "Invalid verification code or code has expired. Please try again." });
    }

    res.json({ success: true, message: "Password updated successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to update password. Please try again." });
  }
});

/**
 * Log Out (Session Clear)
 */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session_token');
  res.json({ success: true, message: "Logged out successfully." });
});

/**
 * Get Current User Profile (Token check)
 */
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const tenant = await db.getTenantById(req.user.id);
    if (!tenant) {
      return res.status(404).json({ error: "User profile not found." });
    }
    res.json({ user: tenant });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user context." });
  }
});

// ================= PROTECTED API ROUTES =================

/**
 * Update Practice settings
 */
app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const updatedSettings = await db.updateTenantSettings(req.user.id, req.body);
    res.json(updatedSettings);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to save settings." });
  }
});

/**
 * Clients API Endpoints
 */
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await db.getClients(req.user.id);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch client registry." });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const newClient = await db.addClient(req.user.id, req.body);
    res.status(201).json(newClient);
  } catch (err) {
    res.status(500).json({ error: "Failed to onboard client." });
  }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await db.updateClient(req.user.id, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Client not found or access denied." });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update client profile." });
  }
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteClient(req.user.id, req.params.id);
    res.json({ success: true, message: "Client and all associated files deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete client profile." });
  }
});

/**
 * Cases API Endpoints
 */
app.get('/api/cases', authenticateToken, async (req, res) => {
  try {
    const cases = await db.getCases(req.user.id);
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch case files." });
  }
});

app.post('/api/cases', authenticateToken, async (req, res) => {
  try {
    const newCase = await db.addCase(req.user.id, req.body);
    res.status(201).json(newCase);
  } catch (err) {
    res.status(500).json({ error: "Failed to register case." });
  }
});

app.put('/api/cases/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await db.updateCase(req.user.id, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Case not found or access denied." });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update case file." });
  }
});

app.delete('/api/cases/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteCase(req.user.id, req.params.id);
    res.json({ success: true, message: "Case files and ledgers deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete case file." });
  }
});

app.post('/api/cases/:id/hearings', authenticateToken, async (req, res) => {
  try {
    const updatedCase = await db.addHearing(req.user.id, req.params.id, req.body);
    if (!updatedCase) {
      return res.status(404).json({ error: "Case not found or access denied." });
    }
    res.status(201).json(updatedCase);
  } catch (err) {
    res.status(500).json({ error: "Failed to log case hearing outcome." });
  }
});

app.put('/api/cases/:id/hearings/:hearingId', authenticateToken, async (req, res) => {
  try {
    const updatedCase = await db.updateHearing(req.user.id, req.params.id, req.params.hearingId, req.body);
    if (!updatedCase) {
      return res.status(404).json({ error: "Case or hearing not found or access denied." });
    }
    res.json(updatedCase);
  } catch (err) {
    console.error("Update hearing error:", err);
    res.status(500).json({ error: "Failed to update case hearing details." });
  }
});

/**
 * Transactions API Endpoints
 */
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await db.getTransactions(req.user.id);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "Failed to load financial ledgers." });
  }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const newTx = await db.addTransaction(req.user.id, req.body);
    res.status(201).json(newTx);
  } catch (err) {
    res.status(500).json({ error: "Failed to log financial ledger entry." });
  }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteTransaction(req.user.id, req.params.id);
    res.json({ success: true, message: "Ledger transaction deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete transaction." });
  }
});

/**
 * Import Backup Data endpoint
 */
app.post('/api/backup/import', authenticateToken, async (req, res) => {
  try {
    await db.importTenantBackup(req.user.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to restore backup snapshot: " + err.message });
  }
});

// ================= TASKS & TEAM ROUTES =================

/**
 * Get Colleagues list
 */
app.get('/api/colleagues', authenticateToken, async (req, res) => {
  try {
    const list = await db.getColleagues(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Add a Colleague
 */
app.post('/api/colleagues', authenticateToken, async (req, res) => {
  const { email, role } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Teammate email is required." });
  }

  try {
    const relation = await db.addColleague(req.user.id, email, role || 'work');
    res.status(201).json(relation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Get Tasks
 */
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const list = await db.getTasks(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create Task
 */
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const newTask = await db.addTask(req.user.id, req.body);
    res.status(201).json(newTask);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Update Task
 */
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await db.updateTask(req.user.id, req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Delete Task
 */
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteTask(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Add Comment to Task
 */
app.post('/api/tasks/:id/comments', authenticateToken, async (req, res) => {
  try {
    const comment = await db.addTaskComment(req.user.id, req.params.id, req.body);
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= SERVE STATIC CLIENT ASSETS =================

// Serve styles.css from /css
app.use('/css', express.static(path.join(__dirname, 'css')));

// Serve modules from /js
app.use('/js', express.static(path.join(__dirname, 'js')));

// Serve images from /images
app.use('/images', express.static(path.join(__dirname, 'images')));

// Serve index.html as main entry route with diagnostic error logging
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Error serving index.html from path: ${indexPath}. Error:`, err);
      if (!res.headersSent) {
        res.status(err.status || 500).send("Chambers Server Error: index.html not found.");
      }
    }
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`==========================================================`);
  console.log(`  CounselAI Multi-Tenant SaaS server running at http://localhost:${PORT}`);
  console.log(`  Start developer watch server with npm run dev`);
  console.log(`==========================================================`);
});

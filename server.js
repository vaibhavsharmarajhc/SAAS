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

// ================= EMAIL UTILITIES (RESEND API INTEGRATION) =================

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Track My Chambers <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn(`[Resend Email Warning] RESEND_API_KEY is not defined. Email logging fallback:\nTo: ${to}\nSubject: ${subject}`);
    return { sent: false, error: "RESEND_API_KEY omitted" };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[Resend API Error]:", data);
      return { sent: false, error: data.message || data.name || "Resend API error" };
    }
    console.log(`[Resend Email Success] Sent email ID: ${data.id}`);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error("[Resend Network Exception]:", err);
    return { sent: false, error: err.message };
  }
}

async function sendWelcomeEmail(to, firmName, lawyerName) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 2rem 1rem; margin: 0; }
        .card { max-width: 580px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .header { background: #1e1b4b; padding: 1.5rem 2rem; border-bottom: 2px solid #d97706; text-align: center; }
        .logo { font-size: 1.6rem; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Georgia', serif; }
        .body { padding: 2rem; line-height: 1.6; }
        h2 { font-size: 1.25rem; color: #fff; margin-top: 0; }
        ul { padding-left: 1.25rem; margin: 1rem 0; color: #94a3b8; }
        li { margin-bottom: 0.5rem; }
        .btn-container { text-align: center; margin: 2rem 0 1rem 0; }
        .btn { display: inline-block; background-color: #d97706; color: #ffffff !important; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 4px; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.05em; }
        .footer { font-size: 0.75rem; color: #4b5563; text-align: center; padding: 1.5rem; background: #0b0f19; border-top: 1px solid #1f2937; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">Track My Chambers</div>
          <span style="font-size: 0.75rem; color: #94a3b8;">Legal Practice & Chamber Management PWA Suite</span>
        </div>
        <div class="body">
          <h2>Welcome, ${lawyerName}!</h2>
          <p>Your digital advocate chamber <strong>${firmName}</strong> has been successfully registered on <strong>Track My Chambers</strong>.</p>
          <p>Your practice manager suite is now live with the following core modules:</p>
          <ul>
            <li><strong>Interactive Case grid</strong> to track court forums, CNR status, and next hearing schedules.</li>
            <li><strong>Advocate Billings & Retainers</strong> to manage invoice statements, receipts, and stamp paper disbursements.</li>
            <li><strong>Client Access Portals</strong> to share direct links to case calendars (with all fee figures omitted for privacy).</li>
          </ul>
          <div class="btn-container">
            <a href="https://trackmychambers.in/login" class="btn">Launch Your Dashboard</a>
          </div>
          <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 1.5rem;">If you have any questions or require support setting up your database, reply to this email to get in touch with our team.</p>
        </div>
        <div class="footer">
          VSH Legal Chambers &bull; Adv. Vaibhav Sharma &bull; Track My Chambers Practice Manager
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject: "Welcome to Track My Chambers!", html });
}

async function sendResetCodeEmail(to, resetCode) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 2rem 1rem; margin: 0; }
        .card { max-width: 500px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .header { background: #1e1b4b; padding: 1.25rem 2rem; border-bottom: 2px solid #d97706; text-align: center; }
        .logo { font-size: 1.4rem; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Georgia', serif; }
        .body { padding: 2rem; line-height: 1.6; text-align: center; }
        h2 { font-size: 1.25rem; color: #fff; margin-top: 0; }
        .code-box { background-color: #0b0f19; border: 1px dashed #d97706; font-size: 2.2rem; font-weight: 700; color: #d97706; padding: 1rem; letter-spacing: 0.3em; margin: 1.5rem 0; border-radius: 6px; display: inline-block; width: 80%; }
        .footer { font-size: 0.75rem; color: #4b5563; text-align: center; padding: 1.5rem; background: #0b0f19; border-top: 1px solid #1f2937; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">Track My Chambers</div>
        </div>
        <div class="body">
          <h2>Password Recovery Request</h2>
          <p style="text-align: left; color: #cbd5e1;">We received a request to reset your advocate account password. Please use the following 6-digit recovery verification code on the reset screen:</p>
          <div class="code-box">${resetCode}</div>
          <p style="text-align: left; font-size: 0.85rem; color: #94a3b8; margin-top: 1rem;">This code is valid for <strong>15 minutes</strong>. If you did not make this request, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          VSH Legal Chambers &bull; Adv. Vaibhav Sharma &bull; Track My Chambers Practice Manager
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject: "Track My Chambers - Password Recovery Code", html });
}

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

    // Send Welcome Email asynchronously
    sendWelcomeEmail(email, firmName || "Track My Chambers", lawyerName || "Advocate");

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

    // Send reset code email via Resend
    const emailResult = await sendResetCodeEmail(email, resetCode);

    res.json({ 
      success: true, 
      code: emailResult.sent ? undefined : resetCode,
      message: emailResult.sent
        ? "A verification code has been sent to your email address."
        : "A verification code has been generated. For testing, it is displayed below." 
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
  res.clearCookie('session_token', { path: '/' });
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
    const { passwordHash: _, ...safeTenant } = tenant;
    res.json({ user: safeTenant });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user context." });
  }
});

/**
 * Change Password (Authenticated)
 */
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "All fields are required (current password, new password)." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  try {
    const tenant = await db.getTenantByIdWithHash(req.user.id);
    if (!tenant) {
      return res.status(404).json({ error: "Advocate account not found." });
    }

    const passwordValid = bcrypt.compareSync(currentPassword, tenant.passwordHash);
    if (!passwordValid) {
      return res.status(400).json({ error: "Current password entered is incorrect." });
    }

    const salt = bcrypt.genSaltSync(10);
    const newPasswordHash = bcrypt.hashSync(newPassword, salt);

    await db.updateTenantPassword(req.user.id, newPasswordHash);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to update password." });
  }
});

/**
 * Support Ticket Endpoints
 */
app.post('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const ticket = await db.addSupportTicket(req.user.id, req.body);
    
    // Send confirmation email asynchronously
    sendEmail({
      to: req.user.email,
      subject: `Support Ticket Created: #${ticket.id.split('_')[1] || ticket.id}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 8px; color: #f1f5f9; padding: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.35);">
          <h2 style="color: #d97706; margin-top:0;">Support Ticket Raised</h2>
          <p>Dear Lead Counsel,</p>
          <p>We have successfully received support ticket <strong>#${ticket.id.split('_')[1] || ticket.id}</strong> in our queue.</p>
          <div style="background: #0b0f19; border-left: 3px solid #d97706; padding: 0.75rem 1rem; margin: 1rem 0; font-size: 0.85rem; color: #94a3b8;">
            <strong>Subject:</strong> ${ticket.subject}<br>
            <strong>Category:</strong> ${ticket.category}<br>
            <strong>Description:</strong> ${ticket.description}
          </div>
          <p>Our engineering support team will address your request shortly. Thank you for using Track My Chambers!</p>
          <div style="font-size: 0.75rem; color: #4b5563; text-align: center; border-top: 1px solid #1f2937; padding-top: 1rem; margin-top: 1.5rem;">
            VSH Legal Chambers &bull; Track My Chambers Support Center
          </div>
        </div>
      `
    }).catch(err => console.error("Failed to send support ticket email:", err));

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Create ticket error:", err);
    res.status(500).json({ error: "Failed to submit support ticket." });
  }
});

app.get('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const tickets = await db.getSupportTickets(req.user.id);
    res.json(tickets);
  } catch (err) {
    console.error("Get tickets error:", err);
    res.status(500).json({ error: "Failed to fetch support tickets." });
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
app.post('/api/clients/:id/regenerate-token', authenticateToken, async (req, res) => {
  try {
    const newToken = await db.regenerateClientToken(req.user.id, req.params.id);
    res.json({ success: true, accessToken: newToken });
  } catch (err) {
    res.status(500).json({ error: "Failed to regenerate client access token." });
  }
});

/**
 * Public Client Access Portal Endpoint (No session auth required)
 */
app.get('/api/portal/:token', async (req, res) => {
  try {
    const portalData = await db.getPublicClientPortalData(req.params.token);
    if (!portalData) {
      return res.status(404).json({ error: "Client access portal link invalid or expired." });
    }
    res.json(portalData);
  } catch (err) {
    res.status(500).json({ error: "Failed to load client case portal." });
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

// ================= SERVER-SENT EVENTS (SSE) REAL-TIME SYNC =================

let sseClients = [];

app.get('/api/events', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  res.write('data: {"type": "connected"}\n\n');

  const client = {
    id: Date.now(),
    userId: req.user.id,
    res
  };

  sseClients.push(client);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

async function broadcastToTeammates(tenantId, data) {
  try {
    const colleagues = await db.getColleagues(tenantId);
    const targetUserIds = [tenantId, ...colleagues.map(c => c.colleagueId)];
    
    sseClients.forEach(c => {
      if (targetUserIds.includes(c.userId)) {
        c.res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    });
  } catch (err) {
    console.error("SSE Broadcast error:", err);
  }
}

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
  const { email, role, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Teammate email is required." });
  }

  try {
    const relation = await db.addColleague(req.user.id, email, role || 'work', name || null);
    res.status(201).json(relation);
    broadcastToTeammates(req.user.id, { type: 'colleagues_changed' });
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
// Helper to create task-level notifications
async function triggerTaskNotification(actorUserId, taskId, actionText) {
  try {
    const actorTenant = await db.getTenantById(actorUserId);
    const actorName = actorTenant ? (actorTenant.lawyerName || actorTenant.email) : "Teammate";
    
    // Fetch task
    const task = await db.getTask(actorUserId, taskId);
    if (!task) return;

    const recipients = new Set();
    
    if (task.tenantId && task.tenantId !== actorUserId) {
      recipients.add(task.tenantId);
    }
    if (task.assigneeId && task.assigneeId !== actorUserId) {
      recipients.add(task.assigneeId);
    }

    for (let recipientId of recipients) {
      await db.addNotification(recipientId, {
        actorName,
        taskId: task.id,
        taskTitle: task.title,
        actionText
      });
      // Broadcast update to that recipient specifically via SSE
      broadcastToTeammates(recipientId, { type: 'notifications_changed', recipientId });
    }
  } catch (err) {
    console.error("Error creating notification:", err);
  }
}

/**
 * Create Task
 */
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const newTask = await db.addTask(req.user.id, req.body);
    res.status(201).json(newTask);
    broadcastToTeammates(req.user.id, { type: 'tasks_changed' });

    if (newTask.assigneeId && newTask.assigneeId !== req.user.id) {
      const actorTenant = await db.getTenantById(req.user.id);
      const actorName = actorTenant ? (actorTenant.lawyerName || actorTenant.email) : "Teammate";
      await db.addNotification(newTask.assigneeId, {
        actorName,
        taskId: newTask.id,
        taskTitle: newTask.title,
        actionText: "assigned a new task to you"
      });
      broadcastToTeammates(newTask.assigneeId, { type: 'notifications_changed', recipientId: newTask.assigneeId });
    }
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
    broadcastToTeammates(req.user.id, { type: 'tasks_changed' });

    // Trigger Notification
    let actionDetails = "updated task details";
    if (req.body.status) actionDetails = `marked status as ${req.body.status}`;
    else if (req.body.kanbanStatus) actionDetails = `moved status to "${req.body.kanbanStatus}"`;
    else if (req.body.assigneeId) actionDetails = `sub-assigned the task to ${req.body.assigneeName || 'a colleague'}`;

    triggerTaskNotification(req.user.id, req.params.id, actionDetails);
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
    broadcastToTeammates(req.user.id, { type: 'tasks_changed' });
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
    broadcastToTeammates(req.user.id, { type: 'comments_changed', taskId: req.params.id });

    // Trigger notification
    triggerTaskNotification(req.user.id, req.params.id, "sent a chat message");
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Notifications API
 */
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const list = await db.getNotifications(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await db.markNotificationRead(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await db.markAllNotificationsRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notifications/clear', authenticateToken, async (req, res) => {
  try {
    await db.clearNotifications(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SUPER ADMIN ROUTES =================
app.get('/api/admin/metrics', authenticateToken, async (req, res) => {
  try {
    const metrics = await db.getPlatformAdminMetrics();
    res.json(metrics);
  } catch (err) {
    console.error("Failed to compile admin metrics:", err);
    res.status(500).json({ error: "Failed to compile admin metrics." });
  }
});

// ================= SERVE STATIC CLIENT ASSETS =================

// Serve styles.css from /css
app.use('/css', express.static(path.join(__dirname, 'css')));

// Serve modules from /js
app.use('/js', express.static(path.join(__dirname, 'js')));

// Serve images from /images
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

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
  console.log(`  Track My Chambers Multi-Tenant SaaS server running at http://localhost:${PORT}`);
  console.log(`  Start developer watch server with npm run dev`);
  console.log(`==========================================================`);
});

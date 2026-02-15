const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Explicit CORS — allow all origins (required for GitHub Pages → Render)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(cors({ origin: '*' }));

// In-memory ticket store (persists while server is running)
const tickets = new Map();
const ratings = [];

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Helper: encode ticket ID to base64 URL-safe string
function encodeTicketId(id) {
  return Buffer.from(id).toString('base64url');
}

// Helper: decode base64 ticket ID
function decodeTicketId(encoded) {
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

// Helper: mask username for display
function maskUsername(username) {
  if (!username || username.length < 2) return username;
  const first = username[0];
  const last = username[username.length - 1];
  const middle = '*'.repeat(Math.max(username.length - 2, 4));
  return `${first}${middle}${last}`;
}

// POST /api/ticket - Create a new ticket
app.post('/api/ticket', async (req, res) => {
  try {
    const { username, platform, areaSize, email } = req.body;

    if (!username || !platform || !areaSize || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ticketId = crypto.randomUUID();
    const encodedId = encodeTicketId(ticketId);
    const ownerLink = `${process.env.BASE_URL}/ticket?${encodedId}`;

    // Final username (bedrock adds period prefix)
    const displayUsername = platform === 'bedrock' ? `.${username}` : username;

    const ticket = {
      id: ticketId,
      username: displayUsername,
      platform,
      areaSize,
      email,
      status: 'open',
      createdAt: new Date().toISOString(),
      messages: [],
    };

    tickets.set(ticketId, ticket);

    // Send confirmation email to user
    await transporter.sendMail({
      from: `"Evans Mining Service" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: '✅ Your Mining Ticket Has Been Received — Evans Mining Service',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: 'Segoe UI', sans-serif; background: #0a0e1a; color: #e0e8ff; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #0d1526; border: 1px solid #1e3a6e; border-radius: 16px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #0d2b6e, #1a4a9e); padding: 40px 32px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; color: #7eb3ff; letter-spacing: 2px; }
          .header p { margin: 8px 0 0; color: #a0c0ff; font-size: 14px; }
          .body { padding: 32px; }
          .card { background: #0a1830; border: 1px solid #1e3a6e; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .label { color: #6b9bd2; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
          .value { color: #e0e8ff; font-size: 16px; font-weight: 600; }
          .footer { background: #070d1a; padding: 20px 32px; text-align: center; color: #4a6a9e; font-size: 12px; border-top: 1px solid #1e3a6e; }
          .badge { display: inline-block; background: #1a3a6e; color: #7eb3ff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        </style></head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⛏ EVANS MINING SERVICE</h1>
              <p>Donut SMP • Official Ticket System</p>
            </div>
            <div class="body">
              <p style="color:#a0c0ff; font-size:16px;">Hey <strong style="color:#7eb3ff">${displayUsername}</strong>,</p>
              <p style="color:#8090b0;">Your mining ticket has been successfully submitted! Evan will review your request and get back to you soon.</p>
              <div class="card">
                <div style="margin-bottom:16px"><div class="label">Username</div><div class="value">${displayUsername}</div></div>
                <div style="margin-bottom:16px"><div class="label">Platform</div><div class="value">${platform === 'bedrock' ? '📱 Bedrock Edition' : '☕ Java Edition'}</div></div>
                <div style="margin-bottom:16px"><div class="label">Area Size</div><div class="value">${areaSize}</div></div>
                <div><div class="label">Status</div><div class="value"><span class="badge">Open</span></div></div>
              </div>
              <p style="color:#8090b0; font-size:14px;">You'll receive another email once Evan responds. Keep an eye on your inbox!</p>
            </div>
            <div class="footer">Evans Mining Service • Donut SMP • Ticket ID: ${ticketId.slice(0, 8).toUpperCase()}</div>
          </div>
        </body>
        </html>
      `,
    });

    // Send notification to owner
    await transporter.sendMail({
      from: `"Evans Mining Tickets" <${process.env.SMTP_EMAIL}>`,
      to: 'littlesharkvr@gmail.com',
      subject: `🎫 New Mining Ticket from ${displayUsername}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: 'Segoe UI', sans-serif; background: #0a0e1a; color: #e0e8ff; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #0d1526; border: 1px solid #1e3a6e; border-radius: 16px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1a2a0d, #2a4a1a); padding: 40px 32px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; color: #7eff9e; letter-spacing: 2px; }
          .body { padding: 32px; }
          .card { background: #0a1830; border: 1px solid #1e3a6e; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .label { color: #6b9bd2; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
          .value { color: #e0e8ff; font-size: 16px; font-weight: 600; }
          .btn { display: inline-block; background: linear-gradient(135deg, #1a4aee, #0d2b9e); color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 16px; letter-spacing: 1px; margin-top: 20px; }
          .footer { background: #070d1a; padding: 20px 32px; text-align: center; color: #4a6a9e; font-size: 12px; border-top: 1px solid #1e3a6e; }
        </style></head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎫 NEW TICKET ALERT</h1>
              <p style="color:#a0d4a0; margin:8px 0 0;">Someone needs your mining services!</p>
            </div>
            <div class="body">
              <div class="card">
                <div style="margin-bottom:16px"><div class="label">Username</div><div class="value">${displayUsername}</div></div>
                <div style="margin-bottom:16px"><div class="label">Platform</div><div class="value">${platform === 'bedrock' ? '📱 Bedrock Edition' : '☕ Java Edition'}</div></div>
                <div style="margin-bottom:16px"><div class="label">Area Size Requested</div><div class="value">${areaSize}</div></div>
                <div><div class="label">Contact Email</div><div class="value">${email}</div></div>
              </div>
              <p style="text-align:center;">
                <a href="${ownerLink}" class="btn">🔗 Open Owner Dashboard</a>
              </p>
              <p style="color:#8090b0; font-size:13px; text-align:center;">Click the link above to view and respond to this ticket from your owner portal.</p>
            </div>
            <div class="footer">Evans Mining Service • Donut SMP • Ticket ID: ${ticketId.slice(0, 8).toUpperCase()}</div>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ success: true, message: 'Ticket created and confirmation sent!' });
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Failed to create ticket', details: err.message });
  }
});

// GET /ticket?<base64> - Owner dashboard to view ticket
app.get('/ticket', (req, res) => {
  const encoded = Object.keys(req.query)[0];
  if (!encoded) return res.status(400).send('Invalid ticket link');
  const ticketId = decodeTicketId(encoded);
  const ticket = tickets.get(ticketId);
  if (!ticket) return res.status(404).send('Ticket not found or expired');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Owner Portal — Evans Mining</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Exo+2:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Exo 2', sans-serif; background: #070d1a; color: #c8d8f0; min-height: 100vh; }
    .bg-grid { position: fixed; inset: 0; background-image: linear-gradient(rgba(30,58,110,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,110,0.15) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }
    .container { max-width: 700px; margin: 0 auto; padding: 32px 16px; position: relative; z-index: 1; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-family: 'Orbitron', monospace; font-size: 22px; color: #7eb3ff; letter-spacing: 3px; margin-bottom: 8px; }
    .owner-badge { display: inline-block; background: linear-gradient(135deg, #1a4aee20, #0d2b9e20); border: 1px solid #1e3a6e; color: #7eb3ff; padding: 6px 18px; border-radius: 20px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
    .card { background: #0d1526; border: 1px solid #1e3a6e; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
    .card-title { font-family: 'Orbitron', monospace; font-size: 14px; color: #4a7aae; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px; }
    .field { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #1e3a6e22; }
    .field:last-child { border-bottom: none; }
    .field-label { color: #6b9bd2; font-size: 13px; }
    .field-value { color: #e0e8ff; font-weight: 600; font-size: 15px; }
    .badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .badge.open { background: #1a3a6e40; color: #7eb3ff; border: 1px solid #1e3a6e; }
    .badge.complete { background: #1a3a1a40; color: #7eff9e; border: 1px solid #1e6e1e; }
    textarea { width: 100%; background: #0a1224; border: 1px solid #1e3a6e; border-radius: 10px; color: #c8d8f0; font-family: 'Exo 2', sans-serif; font-size: 15px; padding: 14px; resize: vertical; min-height: 100px; outline: none; transition: border-color 0.2s; }
    textarea:focus { border-color: #4a7aee; }
    .btn { display: inline-block; width: 100%; padding: 14px; border: none; border-radius: 10px; font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 700; letter-spacing: 2px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; margin-top: 12px; }
    .btn-send { background: linear-gradient(135deg, #1a4aee, #0d2b9e); color: #fff; }
    .btn-send:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,74,238,0.4); }
    .btn-complete { background: linear-gradient(135deg, #1a6e2a, #0d4a1a); color: #7eff9e; margin-top: 8px; }
    .btn-complete:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,110,42,0.4); }
    .toast { position: fixed; top: 24px; right: 24px; background: #1a3a6e; border: 1px solid #4a7aee; color: #7eb3ff; padding: 14px 24px; border-radius: 12px; font-size: 14px; z-index: 999; display: none; animation: slideIn 0.3s ease; }
    @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .expired { text-align: center; padding: 60px 20px; }
    .expired h2 { font-family: 'Orbitron', monospace; color: #4a6a9e; margin-bottom: 16px; }
    .status-${ticket.status} {}
  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="toast" id="toast"></div>
  <div class="container">
    <div class="header">
      <div class="logo">⛏ EVANS MINING</div>
      <div style="margin-top:8px"><span class="owner-badge">🔐 Owner Portal</span></div>
    </div>

    ${ticket.status === 'complete' ? `
    <div class="card" style="border-color:#1e6e1e; text-align:center; padding: 40px;">
      <div style="font-size:48px; margin-bottom:16px;">✅</div>
      <div style="font-family:'Orbitron',monospace; color:#7eff9e; font-size:18px; margin-bottom:8px;">TICKET COMPLETE</div>
      <div style="color:#8090b0;">This ticket has been marked as complete and is no longer active.</div>
    </div>
    ` : `
    <div class="card">
      <div class="card-title">📋 Ticket Details</div>
      <div class="field"><span class="field-label">Username</span><span class="field-value">${ticket.username}</span></div>
      <div class="field"><span class="field-label">Platform</span><span class="field-value">${ticket.platform === 'bedrock' ? '📱 Bedrock' : '☕ Java'}</span></div>
      <div class="field"><span class="field-label">Area Size</span><span class="field-value">${ticket.areaSize}</span></div>
      <div class="field"><span class="field-label">Email</span><span class="field-value">${ticket.email}</span></div>
      <div class="field"><span class="field-label">Submitted</span><span class="field-value">${new Date(ticket.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="field"><span class="field-label">Status</span><span class="field-value"><span class="badge open">Open</span></span></div>
    </div>

    <div class="card">
      <div class="card-title">✉️ Send Message to Player</div>
      <textarea id="messageInput" placeholder="Type your message to the player... (e.g. Hey! I'll start on your plot soon. Meet me at spawn when you're ready.)"></textarea>
      <button class="btn btn-send" onclick="sendMessage()">📨 Send Message</button>
    </div>

    <div class="card" style="border-color:#1e4a1e;">
      <div class="card-title">✅ Complete Ticket</div>
      <p style="color:#8090b0; font-size:14px; margin-bottom:12px;">Mark this ticket as complete. This will expire the owner link and prompt the player to leave a review.</p>
      <button class="btn btn-complete" onclick="completeTicket()">✅ Mark as Complete</button>
    </div>
    `}
  </div>

  <script>
    const ticketId = '${ticketId}';
    const apiBase = window.location.origin;

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 4000);
    }

    async function sendMessage() {
      const msg = document.getElementById('messageInput').value.trim();
      if (!msg) return showToast('Please type a message first.');
      try {
        const res = await fetch(apiBase + '/api/ticket/' + ticketId + '/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Message sent to player!');
          document.getElementById('messageInput').value = '';
        } else {
          showToast('❌ Failed: ' + (data.error || 'Unknown error'));
        }
      } catch(e) {
        showToast('❌ Network error');
      }
    }

    async function completeTicket() {
      if (!confirm('Mark this ticket as complete? The owner link will expire.')) return;
      try {
        const res = await fetch(apiBase + '/api/ticket/' + ticketId + '/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Ticket marked as complete!');
          setTimeout(() => location.reload(), 1500);
        } else {
          showToast('❌ Failed: ' + (data.error || 'Unknown error'));
        }
      } catch(e) {
        showToast('❌ Network error');
      }
    }
  </script>
</body>
</html>`);
});

// POST /api/ticket/:id/message - Owner sends a message to user
app.post('/api/ticket/:id/message', async (req, res) => {
  try {
    const ticket = tickets.get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.status === 'complete') return res.status(400).json({ error: 'Ticket is already complete' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    ticket.messages.push({ from: 'evan', text: message, at: new Date().toISOString() });

    await transporter.sendMail({
      from: `"Evan - Evans Mining" <${process.env.SMTP_EMAIL}>`,
      to: ticket.email,
      subject: `💬 Evan Sent You a Message — Evans Mining Service`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: 'Segoe UI', sans-serif; background: #0a0e1a; color: #e0e8ff; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #0d1526; border: 1px solid #1e3a6e; border-radius: 16px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #0d2b6e, #1a4a9e); padding: 40px 32px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; color: #7eb3ff; letter-spacing: 2px; }
          .body { padding: 32px; }
          .message-bubble { background: linear-gradient(135deg, #1a2a4e, #0d1a3a); border: 1px solid #2a4a7e; border-radius: 14px; padding: 20px; margin: 20px 0; position: relative; }
          .message-bubble::before { content: ''; position: absolute; top: -1px; left: 20px; right: 20px; height: 2px; background: linear-gradient(90deg, #1a4aee, #4a7aee); border-radius: 2px; }
          .sender { color: #7eb3ff; font-weight: 700; font-size: 14px; margin-bottom: 10px; }
          .msg-text { color: #d0e0ff; font-size: 16px; line-height: 1.6; }
          .cta { background: #0a1830; border: 1px solid #1e3a6e; border-radius: 12px; padding: 20px; margin-top: 20px; text-align: center; }
          .footer { background: #070d1a; padding: 20px 32px; text-align: center; color: #4a6a9e; font-size: 12px; border-top: 1px solid #1e3a6e; }
        </style></head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⛏ EVANS MINING SERVICE</h1>
              <p style="color:#a0c0ff; margin:8px 0 0;">You have a new message from Evan!</p>
            </div>
            <div class="body">
              <p style="color:#a0c0ff;">Hey <strong style="color:#7eb3ff">${ticket.username}</strong>,</p>
              <div class="message-bubble">
                <div class="sender">⚡ Evan says:</div>
                <div class="msg-text">${message}</div>
              </div>
              <div class="cta">
                <p style="color:#8090b0; font-size:14px; margin:0;">Whenever you're ready, reply to this email or head to the server to get started!</p>
              </div>
            </div>
            <div class="footer">Evans Mining Service • Donut SMP • Ticket ID: ${ticket.id.slice(0, 8).toUpperCase()}</div>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/ticket/:id/complete - Mark ticket as complete
app.post('/api/ticket/:id/complete', async (req, res) => {
  try {
    const ticket = tickets.get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.status = 'complete';
    ticket.completedAt = new Date().toISOString();

    // Send email to user asking for review
    await transporter.sendMail({
      from: `"Evan - Evans Mining" <${process.env.SMTP_EMAIL}>`,
      to: ticket.email,
      subject: `🎉 Your Mining Plot is Complete! Leave a Review — Evans Mining`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: 'Segoe UI', sans-serif; background: #0a0e1a; color: #e0e8ff; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #0d1526; border: 1px solid #1e3a6e; border-radius: 16px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1a3a0d, #2a5a1a); padding: 40px 32px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; color: #7eff9e; letter-spacing: 2px; }
          .body { padding: 32px; }
          .stars { font-size: 36px; text-align: center; margin: 20px 0; }
          .review-note { background: #0a1830; border: 1px solid #1e3a6e; border-radius: 12px; padding: 20px; margin: 20px 0; color: #8090b0; font-size: 14px; text-align: center; }
          .footer { background: #070d1a; padding: 20px 32px; text-align: center; color: #4a6a9e; font-size: 12px; border-top: 1px solid #1e3a6e; }
        </style></head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 PLOT COMPLETE!</h1>
              <p style="color:#a0d4a0; margin:8px 0 0;">Your mining area is ready on Donut SMP!</p>
            </div>
            <div class="body">
              <p style="color:#a0c0ff;">Hey <strong style="color:#7eb3ff">${ticket.username}</strong>,</p>
              <p style="color:#8090b0;">Evan has completed your ${ticket.areaSize} mining area! Head to the server to check it out.</p>
              <div class="stars">⭐⭐⭐⭐⭐</div>
              <div class="review-note">
                <strong style="color:#7eb3ff;">Would you leave a review?</strong><br><br>
                Head to the Evans Mining Service website and click "Leave a Review" to share your experience. It helps other players and supports Evan's work on Donut SMP!
              </div>
              <p style="color:#8090b0; font-size:14px;">Thank you for using Evans Mining Service! 🎊</p>
            </div>
            <div class="footer">Evans Mining Service • Donut SMP • Ticket ID: ${ticket.id.slice(0, 8).toUpperCase()}</div>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Complete ticket error:', err);
    res.status(500).json({ error: 'Failed to complete ticket' });
  }
});

// POST /api/rating - Submit a rating/review
app.post('/api/rating', (req, res) => {
  try {
    const { username, rating, review } = req.body;
    if (!username || !rating) return res.status(400).json({ error: 'Missing fields' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5' });

    ratings.push({
      username: maskUsername(username),
      rating: parseInt(rating),
      review: review || '',
      at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// GET /api/ratings - Get all ratings
app.get('/api/ratings', (req, res) => {
  const avg = ratings.length > 0 ? (ratings.reduce((a, r) => a + r.rating, 0) / ratings.length).toFixed(1) : 0;
  res.json({ ratings, average: parseFloat(avg), total: ratings.length });
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', tickets: tickets.size }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Evans Mining backend running on port ${PORT}`));
